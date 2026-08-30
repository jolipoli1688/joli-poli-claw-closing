# Manual CLOUD STAGING browser UAT

Use only **JOLI POLI Claw Staging** (`fbvzqdqjqcbjopuinknw`) with synthetic
records and test users. This checklist does not authorize production data,
images, employee accounts, or a production cutover.

## Launch

1. Copy `.env.cloud-staging.example` to the ignored
   `.env.cloud-staging.local` file.
2. Add only the browser-safe `CLAW_SUPABASE_PUBLISHABLE_KEY`. Never put a
   service-role key, password, or token in this file.
3. Double-click [Start_Cloud_Staging.bat](../Start_Cloud_Staging.bat).
4. Confirm the browser opens `http://127.0.0.1:4175/` and shows **STAGING**.

Use the Developer account you already know. In Developer User Management,
deactivate obsolete synthetic accounts if needed, then create users chosen by
you with passwords you choose and do not record here:

| Username | Role | Outlet assignment |
| --- | --- | --- |
| `uat-admin` | Admin | All staging outlets |
| `uat-outlet-a` | Outlet | STG-A only |
| `uat-outlet-b` | Outlet | STG-B only |

## Account and authorization

- Developer: log in with Username + Password; confirm STAGING, access to STG-A
  and STG-B, User Management, Settings, then log out.
- Admin: log in; confirm business functions and STG-A/STG-B access; confirm
  Developer User Management is absent; verify Settings according to Admin
  authorization; log out.
- Outlet A: log in; confirm STG-A only, no STG-B selection/data, no role
  change, no Developer User Management; log out.
- Outlet B: repeat in reverse: STG-B only, no STG-A selection/data, no role
  change, no Developer User Management; log out.

## Daily Closing

Using synthetic staging machines/products only, verify Closing Entry, Machine
Closing, a multi-product machine, positive and negative refill, Final Qty,
meter mode, manual mode, Save Draft, reload/edit Draft, Review, Finalize,
finalized Review, and Closing History.

## Real clipboard image test

1. Copy a synthetic PNG or JPG image to the Windows clipboard.
2. In the authorized machine/product image area, click the intended image
   control and press **Ctrl+V**. Browser permission may require this click.
3. Confirm preview, save, reload, and confirm the private signed image renders.
4. Paste a second synthetic image, save, reload, and confirm replacement.
5. Remove the image and reload; confirm it remains removed.

## Review and Print

Compare CLOUD Review with accepted LOCAL Review: layout, fonts, spacing,
machine/product rows, KPI presentation, images, and totals must match. The
screen-only STAGING indicator must not intrude on printable content.

From CLOUD Review open Chrome/Edge Print Preview and verify A4, Landscape,
accepted margins and scale, repeated table header, product images, natural page
breaks, and no sidebar, workflow controls, action buttons, or STAGING indicator.
The result must match accepted LOCAL Print. Do not change print CSS unless a
specific mismatch is observed and reported.

## Sign-off

Developer: PASS / FAIL

Admin: PASS / FAIL

Outlet A: PASS / FAIL

Outlet B: PASS / FAIL

Daily Closing: PASS / FAIL

Clipboard Paste: PASS / FAIL

Review: PASS / FAIL

Print: PASS / FAIL

Notes:

____________________
