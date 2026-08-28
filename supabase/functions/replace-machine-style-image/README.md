# replace-machine-style-image

Planned secure image replacement workflow:
1. authenticate user,
2. authorize machine/style store access,
3. accept/validate/compress image or accept an already-compressed client upload according to final design,
4. upload new object,
5. update `machine_styles.image_path`,
6. delete previous object after the database reference succeeds,
7. write audit event,
8. on partial failure, leave the previous image reference usable and clean any orphan new object.

Do not implement this function until the development Supabase project and exact image-processing approach are selected.
