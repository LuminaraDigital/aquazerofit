# Coach art (bundled)

These files are a **copy** of the generated web art, checked in so the app can
render coaches offline with no network fetch.

`node tools/coaches/build-art.mjs <source-dir>` writes to
`apps/web/public/coaches/` **only** — it does not touch this directory. After
regenerating, mirror the result here by hand, or the Android build will ship
stale art while the web app shows the new renders:

```
cp -r apps/web/public/coaches/. apps/android/app/src/main/assets/coaches/
```

Do not hand-edit the images: change the source renders and re-run the script.

Each coach directory may also contain `celebrate.webp` and `encourage.webp`
expression variants. Those are optional and are dropped in by hand — the
app falls back to `avatar.webp` for any that are missing, and to a tinted
monogram when even that is absent.
