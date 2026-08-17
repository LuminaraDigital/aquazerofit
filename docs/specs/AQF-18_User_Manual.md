---
logo: design/brand/AquaZeroFit(single_Logo).png
brand: AquaZero
tagline: AI Wellness Assistant
unit: NIT3004 IT Capstone Project 2
title: User Manual
subtitle: Install it, sign in, and run every feature without asking anyone for help
details:
  Document ID: AQF-18
  Product: AquaZeroFit, an AI-powered wellness platform (web and Telegram Mini App)
  Version: 3.0 (rewritten against the shipping build, screenshots captured from the running app)
  Primary author: Eric La (Frontend)
  Document owner: Babatundji Williams-Fulwood (s8138393), Technical Lead and Software Architect
  Contributors: Victor Hong (Data and Quality)
  Group: Group 15, Victoria University, Melbourne
  Telegram bot: @AquaZeroFitBot
  Audience: New users, markers, supervisors
  Status: Issued for supervisor and lecturer review
  Related documents: AQF-11 Safety Privacy and Ethical Design, AQF-15 Runbook and Deployment Guide, AQF-24 Software Architecture and Contribution Report
---

# 1. System Overview

## 1.1 Introduction

This manual tells you how to install AquaZeroFit, how to sign in, and how to use every screen in it. It assumes no technical knowledge. If you can install an app from a QR code and type into a form, you can follow this document from beginning to end.

Section 2 covers installation. Section 3 covers each screen in the order you will meet it. Section 4 lists the problems users actually hit and what to do about them. Section 5 tells you where to get help.

Every screenshot in this manual was captured from the running application, not drawn or mocked up. What you see here is what you will see on your own device.

## 1.2 What AquaZeroFit does

AquaZeroFit is a wellness application that helps you track what you eat, drink enough water, follow a home training plan, and watch your progress over time. An AI assistant called Aqua Coach answers questions in plain language using your own numbers.

It does five things:

- **Nutrition.** Calculates your daily calorie and macronutrient targets, then tracks what you log against them.
- **Meal photographs.** Identifies the food on your plate from a photograph and estimates portions, which you then correct and confirm.
- **Training.** Builds a weekly plan from a library of 828 exercises, filtered to the equipment you actually own.
- **Progress.** Charts your weight trend, your calorie history and your training consistency.
- **Aqua Coach.** Answers questions using your targets, your logs and your plan, in your chosen coach's voice.

## 1.3 The two ways to use it

You can run AquaZeroFit as a **Mini App inside Telegram**, or as a **website in any modern browser**. Both give you the same features and, once linked, the same account and the same history. Choose whichever suits you. The Telegram route is faster to start because there is no password to create.

| | Telegram Mini App | Web application |
| :--- | :--- | :--- |
| How you sign in | Automatically, using your Telegram account | Email address and password |
| Setup time | About thirty seconds | About two minutes |
| Works on | Android, iPhone, Windows, macOS, Linux | Any device with a modern browser |
| Best for | Everyday use on a phone | Larger screens, and marking |

## 1.4 What you need before you start

- A phone, tablet or computer with an internet connection.
- For the Telegram route: the Telegram app, which is free on the App Store, Google Play and telegram.org.
- For the web route: a current version of Chrome, Edge, Firefox or Safari.
- For the meal photograph feature: a camera, or photographs already saved on your device.

## 1.5 Safety notice, please read this

> [!Important]
> AquaZeroFit provides general wellness and fitness support only. It does not diagnose conditions, it does not treat anything, and it does not replace medical advice. The assistant will decline medical and medication questions on purpose, and that behaviour cannot be switched off.
> If you have a health condition, are pregnant, are recovering from an injury, or have any history of disordered eating, speak to a qualified professional before you change your diet or your exercise routine.

The application also refuses to recommend a daily calorie target below a safe floor, which is 1,500 kcal for male profiles and 1,200 kcal for female and unspecified profiles. If the goal you choose would produce a lower number, AquaZeroFit raises it to the floor and tells you it has done so. This is a safety control, not a bug, and it cannot be disabled.

# 2. Installation

## 2.1 Installing the Telegram Mini App

This is the quickest route and the one we recommend for everyday use. There is nothing to download and no password to invent.

### 2.1.1 Install on a phone

1. Install **Telegram** from the App Store or Google Play if you do not already have it, then sign in to Telegram with your phone number.
2. Open your phone camera and point it at the QR code in Figure 1. Tap the link that appears. If your camera does not read QR codes, open Telegram, tap the search box, and type `@AquaZeroFitBot` instead.
3. The AquaZeroFit chat opens. Tap **Start**.
4. Tap the **Open** button in the chat, or the menu button beside the message box. The Mini App launches inside Telegram.
5. You are signed in automatically using your Telegram account. There is no password to enter and no email to confirm.

![Scan this with your phone camera, or search for @AquaZeroFitBot inside Telegram.](docs/screenshots/telegram-qr.jpg){w=2.35}

> [!Note]
> The QR code and the handle both point to the same place. Use whichever is easier on the device in front of you.

### 2.1.2 Install on Telegram Desktop

1. Download Telegram Desktop from telegram.org and sign in with the same phone number you use on your phone.
2. Type `@AquaZeroFitBot` into the search box at the top left and open the result.
3. Click **Start**, then click **Open**. The Mini App opens in a window inside Telegram Desktop.

## 2.2 Installing the web application

Use this route on a laptop or desktop, or if you would rather not use Telegram at all.

### 2.2.1 Open the application

1. Open Chrome, Edge, Firefox or Safari.
2. Go to the AquaZeroFit web address supplied with your account. If you are running the project from source, that address is `http://localhost:5173` (see section 2.4).
3. The welcome screen appears (Figure 2).

### 2.2.2 Create an account

1. On the welcome screen, select **Get started**. If you are already on the sign in screen, select **Create Account** at the top right.
2. Enter a display name if you want one. This field is optional and you can change it later.
3. Enter your email address.
4. Enter a password. The four rules underneath the box turn on as you satisfy them, and all four must be met: **at least 12 characters, one lowercase letter, one uppercase letter, and one digit.**
5. Select **Create Account**. You are signed in immediately and taken to the first run screen described in section 3.1.

![The welcome screen, the first thing a new visitor sees.](docs/screenshots/01-welcome.png) ![Signing in with an existing email address and password.](docs/screenshots/02-sign-in.png) ![Creating an account. The password rules light up as you meet them.](docs/screenshots/02b-create-account.png)

### 2.2.3 Sign in to an existing account

1. Open the web address and select **I already have an account**, or go straight to the sign in screen.
2. Enter your email address and password (Figure 3).
3. Select **Sign In**.
4. If you have forgotten your password, select **Forgot password?** and follow the instructions on screen.

## 2.3 Linking Telegram and the web into one account

If you use both surfaces, link them so that one account holds all of your history. Linking is done **from inside the Mini App**, because that is the only place Telegram can prove who you are.

1. Open the Mini App inside Telegram.
2. Open **Profile and Settings** using the avatar at the top right.
3. Find the **Telegram** row under account access and select **Link**.
4. Sign in with the email address and password of your web account when prompted.
5. The row changes to **Connected**. From then on, opening the Mini App signs you straight into that one account.

> [!Note]
> The link button only appears when the application is running inside Telegram. On an ordinary browser tab the same row explains this and shows no button, because there is no Telegram session for it to read.

## 2.4 Running the project from source

This section is for markers and supervisors who want to run the application on their own machine. Ordinary users can skip it.

### 2.4.1 Prerequisites

- **Node.js version 20 or later.** Check with `node --version`.
- **npm**, which is installed with Node.js.
- **Git**, to obtain the repository.

### 2.4.2 Install and start

Open a terminal in the project folder and run these commands. The first one takes a few minutes.

```
npm install
```

Start the API server. It seeds demo content and the demo account on first boot.

```
npm run api
```

Leave that terminal running. Open a **second** terminal in the same folder and start the web application.

```
npm run dev
```

The API listens on `http://localhost:4000` and the web application on `http://localhost:5173`, which proxies its `/api` calls to the API. Open the second address in a browser.

No `.env` file is required for local development, because the API generates development secrets on boot. If you want to re-run seeding at any point:

```
npm run seed
```

### 2.4.3 The demo account

Every environment is seeded with one populated account so that the product opens with real data in it rather than an empty shell.

| Field | Value |
| :--- | :--- |
| Email address | `demo@aquazero.fit` |
| Password | `AquaZeroDemo!2026` |
| Contents | A complete wellness profile, fourteen days of weight history, meal logs and training history |

> [!Warning]
> These are development credentials for a seeded demo account only. They are published here because the account contains nothing but generated sample data. Never reuse this password on any real account.

# 3. How to Use AquaZeroFit

## 3.1 First run, setting your daily targets

The first time you sign in, AquaZeroFit asks six questions. They are the six values the calorie formula actually needs, and nothing else, so the form is one screen rather than a wizard.

1. Choose **Metric** or **Imperial** at the top. All of your history converts if you change this later.
2. Enter your **age**. Accepted range is 16 to 100.
3. Enter your **height**. Accepted range is 100 cm to 250 cm.
4. Enter your **weight**. Accepted range is 30 kg to 300 kg.
5. Choose **sex**. This is used only to select the offset in the calorie formula, and **Prefer not to say** is a fully supported answer.
6. Choose your **goal**: Lose weight, Maintain, or Gain muscle.
7. Choose your **typical activity** level, from Sedentary through to Very active.
8. Review the consent checkboxes. **Wellness data processing** is required, because without it there is nothing to calculate a target from. AI personalisation, anonymised analytics and reminders are all optional and can be changed later in Settings.
9. Select **Show my targets**. Your daily calorie, macronutrient and water targets are calculated and your first plan is generated.

![The wellness essentials form. Six answers, one screen.](docs/screenshots/16-setup.png) ![Goal, activity level and the consent choices, with the Show my targets button.](docs/screenshots/17-setup-goal.png)

A value outside the accepted range is rejected with a message telling you the range, rather than being quietly clamped.

> [!Note]
> Allergies, dietary preferences, home equipment and training experience are **not** asked for here. They are set to safe defaults, which are bodyweight only, beginner progression and no declared exclusions, and you add them later in Settings. Everything you add there feeds straight into your meal ideas and training plans.

If your chosen goal would produce a calorie target below the safe floor described in section 1.5, the target is raised and a message explains why.

## 3.2 The dashboard

The dashboard is your home screen. It answers one question: what does today look like so far?

- The **nutrition ring** shows calories remaining against your daily goal, with protein, carbohydrate and fat bars underneath.
- The **hydration card** tracks water against your daily target. Select **Log 250ml** each time you drink a glass.
- The **Rest and Recover** card shows today's training session, or tells you it is a rest day.
- The **camera button**, the round control at the lower right, opens the meal photograph screen from anywhere.
- The **streak counter** at the top right shows how many days in a row you have shown up.
- The **five tabs along the bottom** are Home, Nutrition, Workouts, Progress and Coach. They are the whole navigation of the application.

![The dashboard, showing calories remaining, macronutrient bars and hydration.](docs/screenshots/03-dashboard.png)

## 3.3 Nutrition

Open **Nutrition** from the bottom bar.

1. The arrows at the top move between days. **Today** is the default.
2. The ring shows calories remaining. Underneath it, the four figures read **Goal**, minus **Food**, plus **Exercise**, equals **Remaining**.
3. The three bars show protein, carbohydrate and fat consumed against target.
4. To log food by hand, choose the meal (breakfast, lunch, dinner or snack), select **Add**, search for the food, choose the portion size, and confirm.
5. Your dashboard updates immediately.

![The nutrition screen, showing how the remaining calorie figure is arrived at.](docs/screenshots/04-nutrition.png)

## 3.4 Logging a meal from a photograph

This is the feature most people install AquaZeroFit for. It estimates what is on your plate so that you do not have to type it in.

1. Select the **camera button** on the dashboard, or open Nutrition and choose **Scan Meal Photo**.
2. Choose the meal type using the chips at the bottom: Breakfast, Lunch, Dinner or Snack.
3. Frame the whole plate inside the brackets and take the photograph, or select **Gallery** to use one you already have.
4. Wait a few seconds while the photograph is analysed. You can leave the screen. The result waits for you.
5. Review the identified foods. Each item shows an estimated portion and a confidence indicator.
6. **Correct anything that is wrong.** This is expected. The estimate is a starting point, not a verdict.
7. Select **Confirm**. Nothing is added to your log until you confirm.

![The meal capture screen. Frame the whole plate inside the brackets.](docs/screenshots/05-capture-meal.png)

> [!Tip]
> Photograph the meal from above, with the whole plate in the frame and good light. Separated components such as a piece of chicken beside rice and vegetables are identified far more accurately than mixed dishes such as stews and curries.

**Accepted files.** JPEG and PNG, up to 10 MB per photograph. HEIC photographs from an iPhone may be rejected depending on the server build. If that happens, set **Camera, Formats, Most Compatible** in iOS settings and take the photograph again.

**Privacy.** Every uploaded photograph is re-encoded before it is stored, which discards all embedded metadata. That includes the GPS coordinates your phone writes into the file, which are precise enough to identify your home address.

## 3.5 Your AI meal plan

Open **Nutrition** and choose **Meal plan**.

- The header shows how many meals are planned for today and their total calories, against your daily targets.
- Each card is one meal, with its calories, its protein, carbohydrate and fat, and a sentence explaining why it was chosen for you.
- **Log this** records the meal without you retyping anything.
- The **circular arrow** on a card replaces that single meal. The one in the header regenerates the whole day.
- The **thumbs up and thumbs down** controls teach the plan what you like. Use them.

![The AI meal plan, with the reason each meal was chosen.](docs/screenshots/06-meal-plan.png)

## 3.6 Workouts

Open **Workouts** from the bottom bar.

1. The strip at the top is your training week. The circled day is today, and the seated figure marks a rest day.
2. The card underneath is today's session. Select it to open the guided workout, which shows one exercise at a time with a rest timer between sets.
3. Each exercise has a written description and a demonstration image. Read it before your first attempt at a movement.
4. If an exercise is not possible today, use **Swap**. The replacement targets the same muscle group using equipment you have.
5. The **Library** below holds all 828 exercises. Search by name, or filter by type (Strength, Cardio, Core, Mobility), by muscle group, and by equipment.

![The workouts screen, showing the training week, a rest day and the exercise library.](docs/screenshots/08-workouts.png)

> [!Note]
> Rest days are part of the plan, not a failure. Progress comes from recovery as much as it comes from training, which is why the plan schedules rest rather than leaving it to chance.

## 3.7 Progress

Open **Progress** from the bottom bar.

- The **7d, 30d and 90d** buttons set the range for everything below them.
- **Current weight** and **Since start** give you the headline numbers.
- The **Weight journey** chart plots your trend against your goal weight, which is the dashed line.
- The **Calorie trend** chart shows daily intake against target across the range, with your average underneath.
- Training history shows completed sessions and your consistency.

To record a weight, use **Log weight**. Weigh yourself at the same time of day, ideally in the morning before eating. Day to day fluctuation of a kilogram or more is normal and means nothing on its own. The trend line is the number that matters.

![The progress screen, showing the weight trend against the goal line.](docs/screenshots/09-progress.png)

## 3.8 Aqua Coach

Open **Coach** from the bottom bar. Ask questions in plain language, for example "what should I eat tonight with 600 calories left?"

- The coach reads your targets, today's logs, your current plan and your progress summary, so answers are specific to you rather than generic advice.
- The chips underneath each answer show exactly which facts were used. If a number looks wrong, that is where to check it.
- The banner at the top is the wellness disclaimer. It is always present and cannot be dismissed.
- The coach **will decline medical, diagnostic and medication questions** and point you to a professional. This is deliberate.
- If an answer is wrong or unhelpful, use the report control. Reports are reviewed.

![Aqua Coach, showing the facts behind an answer.](docs/screenshots/07-coach.png)

## 3.9 Choosing your coach

Open **Coach** and select the roster icon at the top right.

- Every coach gives the **same safe, measured advice**. What changes is the voice it is delivered in. Choosing a coach does not change what the product will and will not tell you.
- Your **level and XP** are shown at the top. You earn XP for logging, training, hydrating and resting. You never earn XP for eating less, which is a deliberate design decision.
- Select **Choose** on any card to move that coach into your corner. **Bond XP** builds with the coach you actually use.

![The coach roster. The advice is identical, only the voice changes.](docs/screenshots/14-coach-select.png)

## 3.10 Buddy huddles

A huddle is private accountability with a friend for two weeks. There is no public feed and no leaderboard of strangers.

1. Open **Buddy huddles** from the challenges entry point.
2. Choose what you are counting: **Show-up days**, **Workout days**, or **Meal logging days**.
3. Select **Create 14-day huddle**. You are given a code in the form `AQUA-XXXXXX`.
4. Send the code to your friend. They enter it under **Join with a code** and select **Join huddle**.
5. Both of you see the same two counts for fourteen days, and nothing else about each other.

![Buddy huddles. Private accountability, no public feed.](docs/screenshots/13-challenges.png)

## 3.11 Profile and settings

Open settings using the avatar at the top right of any main screen. From here you can:

- Edit your **wellness profile**: age, sex, height, weight and goal. Changing any of these recalculates your targets.
- Add **allergies and dietary preferences**. Allergies are excluded absolutely from every suggestion. Preferences are weighted heavily but not absolutely, which is the difference between the two.
- Record the **equipment** you own at home, and your **training experience**. If you own nothing, leave it at bodyweight only and your plan will use no equipment.
- Switch between **metric and imperial** units at any time. All of your history converts.
- Manage **reminders** for meals, water, workouts and weigh-ins.
- Review the **coach memories** the assistant has kept about you, and delete any of them.
- Change your **privacy consents**, including AI personalisation and anonymised analytics.

![Profile and settings, with the wellness profile and the standing disclaimer.](docs/screenshots/10-settings.png)

## 3.12 Exporting or deleting your data

Both controls are at the bottom of the settings screen, and neither is hidden behind a support request.

- **Export my data** downloads a single JSON file named `aquazerofit-export-<date>.json` containing your records. It is yours to keep.
- **Delete my account** removes your personal records permanently. You are asked to confirm. **This cannot be undone**, so export first if you want a copy.

# 4. Troubleshooting

## 4.1 Common problems

| Problem | Cause | What to do |
| :--- | :--- | :--- |
| The Mini App shows a blank screen in Telegram | The application did not finish loading, or your Telegram version is older than required | Close and reopen the Mini App. If it persists, update Telegram, or open the web address in a browser instead |
| Photograph analysis is taking a long time | The AI service is busy or temporarily unavailable | Leave the screen. Your job is queued and will complete. If it does not, log the meal by hand. Manual logging always works |
| An iPhone photograph is rejected | The photograph is in HEIC format and the server build cannot decode it | Set Camera, Formats, Most Compatible in iOS settings, then take the photograph again. Existing HEIC photographs can be re-saved as JPEG first |
| The assistant will not answer my question | The question falls outside wellness scope, for example a medical or medication question | This is intended behaviour. Consult a general practitioner or an accredited practising dietitian |
| My calorie target is higher than the one I asked for | Your requested goal would have produced a target below the safe floor | The target was raised to the floor. This is a safety control and cannot be disabled. See section 1.5 |
| A suggested meal contains something I cannot eat | The item is recorded as a dietary preference rather than as an allergy | Add it as an **allergy** in Settings. Allergies are excluded absolutely, preferences are only weighted |
| My dashboard does not match what I logged | A log was recorded near midnight and fell on the adjacent day | Open Nutrition and use the back arrow to check the previous day. Day boundaries follow your device timezone |
| I cannot sign in on the web | Wrong password, or the account was created in Telegram and has no password yet | Use **Forgot password?**. If the account began in Telegram, open the Mini App and set an email and password under account access first |
| The Link button is missing in Settings | The application is running in an ordinary browser tab, not inside Telegram | Linking needs Telegram launch data. Open the Mini App inside Telegram and try again. See section 2.3 |
| An exercise demonstration will not play | Network restriction or a slow connection | Use the written description and the still image, which are always available |
| My password is refused when creating an account | One of the four rules is not met | The rules are 12 characters, one lowercase letter, one uppercase letter, one digit. The indicators under the box show which are still outstanding |

## 4.2 Worked example, the API will not start from source

**Symptom.** `npm run api` exits immediately, or the web application loads but every screen shows an error.

**Cause.** Node.js is older than version 20, or the API is not running in a second terminal, or port 4000 is already in use.

**Solution.**

1. Run `node --version`. If it is below 20, install a current Node.js and try again.
2. Confirm the API terminal is still open and still running. The web application on port 5173 proxies to it and cannot work without it.
3. If port 4000 is taken by something else, stop that process, or set `PORT` in a `.env` file and update `CORS_ORIGINS` to match.

## 4.3 Worked example, an empty application after signing in

**Symptom.** You sign in successfully but every screen is empty and no targets are shown.

**Cause.** The wellness profile has not been completed, so there is nothing to calculate targets from.

**Solution.** Complete the six-question form described in section 3.1. If you dismissed it with **Not now**, open Settings and fill in the wellness profile there. Targets appear as soon as the required values are present.

# 5. Getting Help

- For **product questions**, contact the AquaZeroFit team through the address supplied with your account.
- For **urgent health concerns**, contact your general practitioner. In an emergency in Australia, call **000**.
- For **mental health support** in Australia, Lifeline is available on **13 11 14**.
- For **eating disorder support** in Australia, the Butterfly Foundation National Helpline is available on **1800 33 4673**.

> [!Important]
> If AquaZeroFit ever tells you something that contradicts advice from a doctor, a dietitian or another qualified professional, follow the professional. The application is a tracking and planning tool. It is not a clinician and it has never met you.
