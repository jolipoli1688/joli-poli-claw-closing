from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Iterable

MONEY = Decimal("0.01")
RATE = Decimal("0.0001")


def to_decimal(value: object, default: str = "0") -> Decimal:
    if value is None or value == "":
        return Decimal(default)
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, ValueError, AttributeError) as exc:
        raise ValueError(f"Invalid numeric value: {value!r}") from exc


def to_int(value: object, default: int = 0) -> int:
    if value is None or value == "":
        return default
    try:
        number = to_decimal(value)
        if number != number.to_integral_value():
            raise ValueError
        return int(number)
    except (ValueError, InvalidOperation) as exc:
        raise ValueError(f"Expected a whole number, received {value!r}") from exc


def q_money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


def q_rate(value: Decimal) -> Decimal:
    return value.quantize(RATE, rounding=ROUND_HALF_UP)


@dataclass(slots=True)
class SalesInput:
    cash_sales: Decimal
    cash_transactions: int
    aba_sales: Decimal
    aba_transactions: int
    adjustment: Decimal
    beginning_coins: int
    coins_added: int
    final_coins: int


@dataclass(slots=True)
class MachineInput:
    machine_id: str
    machine_name: str
    machine_type: str
    capacity: int
    begin_prize: int
    refill_prize: int
    final_prize: int
    begin_coin_meter: int
    final_coin_meter: int
    status: str = "Working"
    notes: str = ""


@dataclass(slots=True)
class MachineResult:
    machine_id: str
    machine_name: str
    machine_type: str
    capacity: int
    begin_prize: int
    refill_prize: int
    available_prize: int
    final_prize: int
    prizes_won: int
    refill_needed: int
    begin_coin_meter: int
    final_coin_meter: int
    coins_used: int
    coins_per_prize: Decimal
    allocated_sales: Decimal
    avg_revenue_per_prize: Decimal
    status: str
    notes: str

    def as_record(self) -> dict[str, object]:
        record = asdict(self)
        for key in ("coins_per_prize", "allocated_sales", "avg_revenue_per_prize"):
            record[key] = float(record[key])
        return record


@dataclass(slots=True)
class ClosingResult:
    total_sales: Decimal
    total_transactions: int
    coins_dispensed: int
    machine_coins_used: int
    coin_variance: int
    average_sale_value_per_coin: Decimal
    total_prizes_won: int
    average_coins_per_prize: Decimal
    average_revenue_per_prize: Decimal
    closing_status: str
    machines: list[MachineResult]

    def as_record(self) -> dict[str, object]:
        return {
            "total_sales": float(self.total_sales),
            "total_transactions": self.total_transactions,
            "coins_dispensed": self.coins_dispensed,
            "machine_coins_used": self.machine_coins_used,
            "coin_variance": self.coin_variance,
            "average_sale_value_per_coin": float(self.average_sale_value_per_coin),
            "total_prizes_won": self.total_prizes_won,
            "average_coins_per_prize": float(self.average_coins_per_prize),
            "average_revenue_per_prize": float(self.average_revenue_per_prize),
            "closing_status": self.closing_status,
        }


def validate_inputs(sales: SalesInput, machines: Iterable[MachineInput]) -> None:
    money_fields = {
        "Cash sales": sales.cash_sales,
        "ABA sales": sales.aba_sales,
    }
    for label, value in money_fields.items():
        if value < 0:
            raise ValueError(f"{label} cannot be negative.")

    integer_fields = {
        "Cash transactions": sales.cash_transactions,
        "ABA transactions": sales.aba_transactions,
        "Beginning coins": sales.beginning_coins,
        "Coins added": sales.coins_added,
        "Final coins": sales.final_coins,
    }
    for label, value in integer_fields.items():
        if value < 0:
            raise ValueError(f"{label} cannot be negative.")

    if sales.final_coins > sales.beginning_coins + sales.coins_added:
        raise ValueError("Final coins cannot be greater than beginning coins plus coins added.")

    total_sales = sales.cash_sales + sales.aba_sales + sales.adjustment
    coins_dispensed = sales.beginning_coins + sales.coins_added - sales.final_coins
    if total_sales < 0:
        raise ValueError("Total sales cannot be negative after adjustment.")
    if total_sales > 0 and coins_dispensed <= 0:
        raise ValueError("Coins dispensed must be greater than zero when sales are recorded.")

    for machine in machines:
        if machine.capacity <= 0:
            raise ValueError(f"{machine.machine_name}: capacity must be greater than zero.")
        if min(
            machine.begin_prize,
            machine.refill_prize,
            machine.final_prize,
            machine.begin_coin_meter,
            machine.final_coin_meter,
        ) < 0:
            raise ValueError(f"{machine.machine_name}: quantities and meter values cannot be negative.")
        available = machine.begin_prize + machine.refill_prize
        if machine.final_prize > available:
            raise ValueError(
                f"{machine.machine_name}: final prize quantity cannot exceed begin quantity plus refill."
            )
        if machine.final_prize > machine.capacity:
            raise ValueError(
                f"{machine.machine_name}: final prize quantity cannot exceed machine capacity ({machine.capacity})."
            )
        if machine.final_coin_meter < machine.begin_coin_meter:
            raise ValueError(
                f"{machine.machine_name}: final coin meter cannot be lower than the beginning meter."
            )


def calculate_closing(
    sales: SalesInput,
    machines: list[MachineInput],
    variance_tolerance: int = 0,
) -> ClosingResult:
    validate_inputs(sales, machines)

    total_sales = q_money(sales.cash_sales + sales.aba_sales + sales.adjustment)
    total_transactions = sales.cash_transactions + sales.aba_transactions
    coins_dispensed = sales.beginning_coins + sales.coins_added - sales.final_coins

    preliminary: list[tuple[MachineInput, int, int, int]] = []
    machine_coins_used = 0
    total_prizes_won = 0

    for machine in machines:
        available_prize = machine.begin_prize + machine.refill_prize
        prizes_won = available_prize - machine.final_prize
        coins_used = machine.final_coin_meter - machine.begin_coin_meter
        preliminary.append((machine, available_prize, prizes_won, coins_used))
        machine_coins_used += coins_used
        total_prizes_won += prizes_won

    average_coin_value = (
        q_rate(total_sales / Decimal(coins_dispensed)) if coins_dispensed > 0 else Decimal("0")
    )

    machine_results: list[MachineResult] = []
    for machine, available_prize, prizes_won, coins_used in preliminary:
        allocated_sales = q_money(Decimal(coins_used) * average_coin_value)
        coins_per_prize = (
            q_rate(Decimal(coins_used) / Decimal(prizes_won))
            if prizes_won > 0
            else Decimal("0")
        )
        avg_revenue_per_prize = (
            q_money(allocated_sales / Decimal(prizes_won))
            if prizes_won > 0
            else Decimal("0")
        )
        machine_results.append(
            MachineResult(
                machine_id=machine.machine_id,
                machine_name=machine.machine_name,
                machine_type=machine.machine_type,
                capacity=machine.capacity,
                begin_prize=machine.begin_prize,
                refill_prize=machine.refill_prize,
                available_prize=available_prize,
                final_prize=machine.final_prize,
                prizes_won=prizes_won,
                refill_needed=max(machine.capacity - machine.final_prize, 0),
                begin_coin_meter=machine.begin_coin_meter,
                final_coin_meter=machine.final_coin_meter,
                coins_used=coins_used,
                coins_per_prize=coins_per_prize,
                allocated_sales=allocated_sales,
                avg_revenue_per_prize=avg_revenue_per_prize,
                status=machine.status,
                notes=machine.notes,
            )
        )

    coin_variance = machine_coins_used - coins_dispensed
    average_coins_per_prize = (
        q_rate(Decimal(machine_coins_used) / Decimal(total_prizes_won))
        if total_prizes_won > 0
        else Decimal("0")
    )
    average_revenue_per_prize = (
        q_money(total_sales / Decimal(total_prizes_won))
        if total_prizes_won > 0
        else Decimal("0")
    )

    if abs(coin_variance) <= variance_tolerance:
        closing_status = "Balanced"
    elif coin_variance > 0:
        closing_status = "Machine Over"
    else:
        closing_status = "Machine Short"

    return ClosingResult(
        total_sales=total_sales,
        total_transactions=total_transactions,
        coins_dispensed=coins_dispensed,
        machine_coins_used=machine_coins_used,
        coin_variance=coin_variance,
        average_sale_value_per_coin=average_coin_value,
        total_prizes_won=total_prizes_won,
        average_coins_per_prize=average_coins_per_prize,
        average_revenue_per_prize=average_revenue_per_prize,
        closing_status=closing_status,
        machines=machine_results,
    )
