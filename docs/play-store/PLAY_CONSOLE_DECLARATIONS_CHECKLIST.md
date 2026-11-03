# Play Console declarations checklist (paste-ready)

App **AquaZeroFit** (`fit.aquazero.app`) · LUMINARA DIGITAL PTY LTD.
Everything below is derived from the **merged release manifest**
(`apps/android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml`,
built with `./gradlew :app:processReleaseMainManifest` on 4 November 2026) and
from the code that reads each permission. Re-derive it whenever a dependency or
a permission changes; the merged manifest is what Play reads, not
`src/main/AndroidManifest.xml`.

Text in code blocks is written to be pasted as is. Keep Australian English.

---

## 0. Before you submit (operator)

1. **Deploy the web build** from the branch carrying this checklist, so the
   legal pages are published (no draft banner) and `/account/deletion` serves
   its prerendered, no-JavaScript copy. Check with
   `curl -s https://aquazerofit.com/account/deletion | grep "erased automatically after 30 days"`
   and open `https://aquazerofit.com/google-play/privacy-policy` with
   JavaScript disabled.
2. **Confirm backups and request logs are in Sydney.** The privacy policy now
   states that database backups and request logs are kept in
   `australia-southeast1`. Cloud Run, Cloud SQL (`azf-pg`) and Artifact Registry
   are pinned there in `cloudbuild.yaml` and `deploy/cloudrun/service.yaml`;
   backup and log locations are set outside the repository, so check both:
   ```bash
   # Cloud SQL backups. Empty location = Google's default multi-region, which is NOT Sydney.
   gcloud sql instances describe azf-pg --project=aquazerofit \
     --format='value(region,settings.backupConfiguration.location)'
   # Pin them if needed:
   gcloud sql instances patch azf-pg --project=aquazerofit --backup-location=australia-southeast1

   # Request logs (Cloud Run writes to the _Default bucket; it is "global" unless moved).
   gcloud logging buckets list --project=aquazerofit --format='table(name,location)'
   # If _Default is global, create a Sydney bucket and route the _Default sink to it:
   gcloud logging buckets create azf-logs --project=aquazerofit --location=australia-southeast1 --retention-days=30
   gcloud logging sinks update _Default --project=aquazerofit \
     logging.googleapis.com/projects/aquazerofit/locations/australia-southeast1/buckets/azf-logs
   ```
   Until both read `australia-southeast1`, the policy's backup and log
   statement is not yet true. Fix the configuration, not the policy text.
   (The `_Required` bucket holds Google's own admin audit logs, not request
   logs with user IP addresses, and cannot be moved.)
3. **Reviewer account.** Provision it from Secret Manager and sign in once
   yourself: `docs/play-store/REVIEWER_ACCESS.md`.
4. **App Links.** Add the Play App Signing SHA-256 (section 9) and redeploy the
   web build.

---

## 1. URLs

| Field | Value |
|---|---|
| Privacy policy (Store settings and App content → Privacy policy) | `https://aquazerofit.com/google-play/privacy-policy` |
| Delete account URL (Data safety → Data deletion) | `https://aquazerofit.com/account/deletion` |
| Website | `https://aquazerofit.com` |
| Support email | `info@luminara.digital` |

Both legal URLs answer `200` with the page itself (no redirect) from the
Cloudflare Worker (`cloudflare/src/proxy.ts`, `LEGAL_PAGE_PATHS`) and from the
API's static fallback (`apps/api/src/platform/legalStatic.ts`).

---

## 2. Permission inventory (merged release manifest)

| Permission | Source | Runtime prompt | What uses it | Play declaration |
|---|---|---|---|---|
| `INTERNET` | app | No | All API traffic | None |
| `ACCESS_NETWORK_STATE` | WorkManager, Firebase | No | Connectivity checks for background sync and telemetry | None |
| `WAKE_LOCK` | WorkManager, Firebase | No | Background work scheduling | None |
| `RECEIVE_BOOT_COMPLETED` | WorkManager | No | Re-schedules reminder and sync work after a reboot | None |
| `com.android.vending.BILLING` | Play Billing | No | Subscriptions | In-app products |
| `fit.aquazero.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | androidx.core | No | Internal, app-private broadcast guard | None |
| `VIBRATE` | app | No | Celebration haptics (`CelebrationHaptics.kt`) | None |
| `POST_NOTIFICATIONS` | app | Yes (API 33+) | Hydration/meal reminders (`ReminderNotifier.kt`) and the workout notification | None |
| `CAMERA` | app | Yes | Meal photos (`CaptureMealScreen`) and on-device barcode scanning (ML Kit) | Data safety: Photos |
| `RECORD_AUDIO` | app | Yes, on first mic tap | Coach dictation (`CoachVoiceEngine.kt`) | Data safety: Voice or sound recordings (section 5) |
| `ACTIVITY_RECOGNITION` | app | Yes, on "Start workout" | Prerequisite for the `health` foreground service type; no activity data is read | Foreground service (section 6) |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_HEALTH` | app | No | `WorkoutLiveService` (`foregroundServiceType="health"`), the only typed service in the merged manifest | Foreground service types (section 6) |
| `health.READ_STEPS` | app | Health Connect UI | Health Connect card in Settings | Health Connect (section 3) |
| `health.READ_HEART_RATE` | app | Health Connect UI | Same card; also satisfies the `health` FGS prerequisite | Health Connect (section 3) |
| `health.READ_SLEEP` | app | Health Connect UI | Same card: last night's sleep duration (`SleepSessionRecord.SLEEP_DURATION_TOTAL`) | Health Connect (section 3) |
| `health.READ_TOTAL_CALORIES_BURNED` | app | Health Connect UI | Same card: today's total energy burned | Health Connect (section 3) |

**Removed at merge time** (`tools:node="remove"`, confirmed `REJECTED` in
`build/outputs/logs/manifest-merger-release-report.txt`): `com.google.android.gms.permission.AD_ID`,
`ACCESS_ADSERVICES_AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION`,
`BIND_GET_INSTALL_REFERRER_SERVICE`. Advertising ID: **not used**.

**Unused permissions:** none. Every permission above has a caller. No write
permission and no `READ_HEALTH_DATA_HISTORY` / `READ_HEALTH_DATA_IN_BACKGROUND`
is requested.

---

## 3. Health Connect declaration

App content → Health apps → **Health Connect** → access to data types. Read
access only, four types. For each, paste:

**Steps (read)**
```
AquaZeroFit shows the user's step count for today on the Health Connect card in Settings, next to the meals, water and workouts they log in the app, so they can see their whole day in one place. It is read only after the user connects Health Connect in Settings, is displayed on the device only, and is never uploaded to our servers, shared, sold, used for advertising or used to train AI.
```

**Heart rate (read)**
```
AquaZeroFit shows the user's average and lowest heart rate for today on the Health Connect card in Settings, so they can see how their training day went alongside the workouts they log. It is read only after the user connects Health Connect in Settings, is displayed on the device only, and is never uploaded to our servers, shared, sold, used for advertising or used to train AI.
```

**Sleep (read)**
```
AquaZeroFit shows the user's total sleep duration for last night on the Health Connect card in Settings, because recovery is part of planning a training and nutrition day. It reads only the total duration, not sleep stages. It is read only after the user connects Health Connect in Settings, is displayed on the device only, and is never uploaded to our servers, shared, sold, used for advertising or used to train AI.
```

**Total calories burned (read)**
```
AquaZeroFit shows the user's total calories burned for today on the Health Connect card in Settings, next to the calories they have eaten, so they can compare intake with expenditure. It is read only after the user connects Health Connect in Settings, is displayed on the device only, and is never uploaded to our servers, shared, sold, used for advertising or used to train AI.
```

Supporting answers:

| Question | Answer |
|---|---|
| Does the app write to Health Connect? | No |
| Background reads / history beyond 30 days? | No |
| Privacy policy covers Health Connect? | Yes: "What we collect" in `https://aquazerofit.com/google-play/privacy-policy` names the four types and states Limited Use |
| Permissions rationale screen | `HealthPermissionRationaleActivity` (pre-Android 14 intent filter) and the `ViewPermissionUsageActivity` alias (Android 14+) |
| Limited Use statement | "Our use of information received from Health Connect adheres to the Health Connect Permissions policy, including its Limited Use requirements." (in the policy) |

---

## 4. Health apps declaration

App content → **Health apps**. Tick:

- **Activity and fitness**
- **Nutrition and weight management**
- **Sleep management** (the app requests `READ_SLEEP` and shows last night's
  sleep duration; declaring it keeps the declaration consistent with the
  Health Connect access above)

Do **not** tick any medical, mental health, medication, clinical or
physiotherapy category. Description, if asked:

```
AquaZeroFit is a general wellness and fitness app: meal and water logging, calorie and macro targets calculated from the user's own profile, home training plans, progress tracking and an AI coach that stays inside wellness boundaries. With the user's permission it reads steps, heart rate, sleep duration and total calories burned from Health Connect to display them alongside the user's own logs. It does not diagnose, treat or provide medical advice.
```

---

## 5. Data safety

**Overview questions**

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (HTTPS only; cleartext refused by `network_security_config.xml`) |
| Which account creation methods does your app support? | Username and password |
| Delete account URL | `https://aquazerofit.com/account/deletion` |
| Can users request deletion of some data without deleting the account? | Yes: individual logs, every remembered coach fact, and food-photo training samples (turning the setting off deletes them) |

**Data types.** "Shared" is answered conservatively: data sent to the AI
providers (Groq, OpenAI, Google Gemini, NVIDIA NIM) and to Firebase is marked
shared, matching the form already submitted. Purposes use Play's labels.

| Data type | Collected | Shared | Ephemeral | Required / optional | Purposes |
|---|---|---|---|---|---|
| Name (display name) | Yes | Yes | No | Required | App functionality, Personalisation |
| Email address | Yes | Yes | No | Required | App functionality, Account management |
| User IDs | Yes | Yes | No | Required | App functionality, Account management, Analytics |
| Other info (age, sex, timezone) | Yes | Yes | No | Optional | App functionality, Personalisation |
| Purchase history | Yes | No | No | Optional | App functionality, Account management |
| Health info (meals, nutrition, weight, allergies, dietary preferences) | Yes | Yes | No | Optional | App functionality, Personalisation |
| Fitness info (workouts, activity level, equipment) | Yes | Yes | No | Optional | App functionality, Personalisation |
| Other in-app messages (coach conversations) | Yes | Yes | No | Optional | App functionality, Personalisation |
| Photos (meal photos) | Yes | **Yes** (sent to the AI vision provider) | No (kept up to 24 hours, longer only with food-photo training on) | Optional | App functionality, Analytics |
| **Voice or sound recordings** | **Yes** | No | **Yes** | Optional | App functionality |
| In-app search history (food searches) | Yes | No | Yes | Optional | App functionality |
| Other user-generated content | Yes | No | No | Optional | App functionality |
| Crash logs | Yes | Yes | No | Optional | Analytics |
| Diagnostics | Yes | Yes | No | Optional | Analytics |
| App interactions | Yes | Yes | No | Optional | Analytics, App functionality |
| Device or other IDs (Firebase installation and app instance IDs) | Yes | Yes | No | Optional | Analytics |

**Not collected:** Health Connect data (steps, heart rate, sleep, calories
burned are read and displayed on the device only, never transmitted);
location (no location permission; see the note in `DECLARATIONS.md`);
contacts, calendar, files, SMS, web browsing, installed apps, financial
account details (card details stay with Google Play and Stripe).

**Voice or sound recordings, rationale** (keep for review queries):

```
Audio is used only for optional dictation in the AI coach, started by the user tapping the microphone. The app passes the microphone stream to the device's speech recognition service and receives only the transcribed text, which the user can edit before sending. AquaZeroFit never records, stores or uploads audio; the transcript, if sent, is handled as a coach message.
```

---

## 6. Foreground service types

App content → **Foreground service types**. One service: `WorkoutLiveService`,
type **Health**. Delete any leftover `specialUse` draft.

```
WorkoutLiveService runs only during a workout the user starts by tapping "Start workout". It shows an ongoing notification with the live rest-timer countdown and +30 seconds / skip controls on the lock screen and notification shade, so the user can follow their rest periods without keeping the app open. It stops when the workout ends. It is a fitness exercise tracker use case, which is what the health type covers. The ACTIVITY_RECOGNITION permission is requested only because Android requires a health-type prerequisite permission; the app reads no activity data with it.
```

Video: record the workout session screen, pull the shade down to show the
countdown ticking, tap +30s once, then end the session and show the
notification disappear.

---

## 7. Microphone justification

`RECORD_AUDIO` is not a Console declaration of its own, but reviewers ask.
Paste into review notes or a policy query:

```
AquaZeroFit requests the microphone only when the user taps the microphone button in the AI coach, to dictate a message instead of typing it. The request is made at that moment, never at launch, and declining keeps the coach fully usable by keyboard. Speech is converted to text by the device's speech recognition service; AquaZeroFit receives only the text and never records, stores or uploads audio.
```

---

## 8. Sign-in details (App access)

See `docs/play-store/REVIEWER_ACCESS.md`. Use the dedicated reviewer account
from Secret Manager (`PLAY_REVIEWER_EMAIL` / `PLAY_REVIEWER_PASSWORD`). Never
the old demo account: its password is public.

---

## 9. App Links: add the Play App Signing SHA-256

`apps/web/public/.well-known/assetlinks.json` lists only the upload key. Play
re-signs every install with the **app signing key**, so links do not verify
until its fingerprint is listed too.

1. Play Console → Test and release → **App integrity** → App signing →
   **App signing key certificate** → copy the **SHA-256** value.
2. From the repository root: `npm run assetlinks:add -- "<paste>"` (colons,
   spaces and case do not matter; adding one that is already there is a no-op).
3. `npm test --workspace apps/web` (validates the file), commit, open a PR,
   deploy the web build.
4. On a device with the Play-installed app:
   `adb shell pm verify-app-links --re-verify fit.aquazero.app` then
   `adb shell pm get-app-links fit.aquazero.app` should show `aquazerofit.com: verified`.

Do not type a fingerprint from anywhere else; a wrong value fails silently.
