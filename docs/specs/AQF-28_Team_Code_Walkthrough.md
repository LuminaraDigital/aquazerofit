---
logo: design/brand/AquaZeroFit(single_Logo).png
brand: AquaZero
tagline: AI Wellness Assistant
unit: NIT3004 IT Capstone Project 2
title: Team Code Walkthrough
subtitle: Who built what, and what the code does, explained without jargon
details:
  Document ID: AQF-28
  Project: AquaZeroFit, an AI-powered wellness platform (web and Telegram Mini App)
  Prepared by: Babatundji Williams-Fulwood, Eric La, Victor Hong
  Group: Group 15, Victoria University, Melbourne
  Purpose: A short briefing each team member can speak from, readable by a non-developer
  Full technical detail: AQF-24 Software Architecture and Contribution Report
  Status: Issued for review
---

# 1. About This Briefing

This is the short version. It covers three things only: what each of us built, the actual code behind it, and what that code does in plain English.

The full technical report is AQF-24. This document exists so that a reader who does not write software can follow what we did, and so that each of us can explain our own part without reaching for jargon.

Every code sample here is copied straight from our repository. None of it has been simplified or rewritten for the document, because a sample that has been tidied up is no longer evidence. What has been simplified is the explanation underneath it.

## 1.1 Six words you will need

| Word | What it means here |
| :--- | :--- |
| Function | A named piece of code that takes something in and gives an answer back. |
| Return | What a function hands back when it finishes. |
| Model, or AI | The artificial intelligence part. We use it to recognise things, never to do maths. |
| Deterministic | Same input, same answer, every time. Ordinary arithmetic is deterministic. AI is not. |
| Endpoint | One operation the app can ask the server to do, such as "save this meal". |
| Corpus | Our own reference database. We have one of foods and one of exercises. |

## 1.2 The one idea behind the whole app

Our app photographs a plate of food and tells the user how many calories are in it. The obvious way to build that is to ask an AI model. We deliberately did not.

An AI model is very good at looking at a photo and saying "that is rice and grilled chicken". It is unreliable at saying "that is 412 calories". It will give a confident number that is wrong, and the user has no way to tell. Repeated every day for months, that is not a software bug, it is a health problem.

So we split the job in two:

> **The AI names the food. Our own code does the maths.**

The model tells us "rice, about 150 grams". Our code looks rice up in our own food database and multiplies. That one rule shaped almost every decision in the project, and all three of our sections below are examples of it.

# 2. Victor Hong: Food And Nutrition

## 2.1 What I built

I own everything to do with food: working out the user's daily calorie and nutrition targets, the food database and search, logging meals, the barcode scanner, the meal photo feature, and the allergy filter.

## 2.2 Working out a safe daily calorie target

The app asks for height, weight, age, sex, activity level and goal, then calculates how many calories that person needs in a day. That part is a standard published formula, not AI.

The interesting part is what happens when the honest answer is unsafe. A very light person with an aggressive weight loss goal can produce a calorie target that is too low to be healthy. So the code checks the result against a safety floor before it shows it to anyone.

```ts
  // Safety clamp: the engine never proposes intake below the floor (FR-031).
  const floor = KCAL_FLOOR[profile.sex];
  const clamped = rawTarget < floor;
  const kcalTarget = clamped ? floor : rawTarget;
```

**Reading the code**

- `floor` is the lowest calorie figure we will ever suggest. It is 1200 or 1500 depending on sex.
- `clamped` is a simple true or false: was the calculated target below that floor?
- The last line reads "if it was too low, use the floor instead, otherwise use the calculated number".
- The app also records **why** it changed, and shows the user a message explaining it, rather than quietly moving the number.

**Why it matters:** the app is never the thing that told somebody to eat too little.

## 2.3 Turning a photo of a meal into calories

The user photographs their plate. We send the picture to an AI model, which returns a list like "rice, about 150 grams". This next piece of code is where the AI's part of the job ends.

```ts
      // Deterministic nutrition: the model identifies, CODE calculates.
      const food = p.foodId ? foods.find((f) => f.id === p.foodId) : undefined;
      if (!food) continue; // never trust free-text identifications we cannot ground
      const grams = Math.min(2000, Math.max(10, Math.round(p.estimatedGrams ?? 100)));
      const grounded = nutritionFromFood(food, grams);
```

**Reading the code**

- `foods.find(...)` looks up the item the AI named in **our own** food database.
- `if (!food) continue` means: if we cannot find it in our database, skip it entirely. We would rather show the user one item fewer than invent numbers for something we cannot verify.
- The `grams` line takes the AI's portion guess and forces it between 10 and 2000 grams, so a wild estimate cannot get through.
- The last line does the actual arithmetic from our own database, not from anything the AI said.

Nothing is saved to the user's diary at this point. They see a draft, they can correct it, and only when they press confirm does it become a record. The photo is then deleted.

## 2.4 The allergy filter

If a user tells us they are allergic to peanuts, the app must never suggest a food containing peanuts. This check is done by our code, before the AI is shown any options at all.

```ts
/** True when the item may contain the allergen (declared OR keyword hit). */
export function itemContainsAllergen(item: AllergenCheckable, allergen: Allergen): boolean {
  if ((item.allergens ?? []).includes(allergen)) return true;
  const keywords = ALLERGEN_NAME_KEYWORDS[allergen] ?? [];
  const texts = textsOf(item);
  return texts.some((text) => keywords.some((kw) => text.includes(kw)));
}
```

**Reading the code**

- The function answers one question: might this food contain this allergen? True or false.
- The first line checks the food's own allergen label. That is the reliable source when it exists.
- Real food data often has that label missing, so the rest of the function is a backup: it searches the food's name and ingredients for warning words. That is how "satay" gets caught as peanuts and "tahini" as sesame.
- Note the wording in the comment: **may** contain. If either check is unsure, we block it.

**Why it matters:** blocking a food that was actually fine is a small annoyance. Missing one is a hospital visit. So we deliberately built it to over-block, and an AI is never asked for an opinion on this.

## 2.5 Checking a barcode before we look it up

When the user scans a packaged product, we check the barcode is genuine before searching for it. Barcodes have a built-in self-check: the last digit is calculated from the others.

```ts
export function isValidBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{13}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  // From the rightmost data digit, weights alternate 3,1,3,1...
  const sum = digits.reduce((acc, d, i) => {
    const fromRight = digits.length - 1 - i;
    return acc + d * (fromRight % 2 === 0 ? 3 : 1);
  }, 0);
  return (10 - (sum % 10)) % 10 === check;
}
```

**Reading the code**

- The first line rejects anything that is not exactly 8 or 13 digits.
- `check` is that last digit, removed and set aside.
- The middle section adds up the remaining digits, multiplying every second one by three. That is the international standard for barcodes.
- The final line asks: does our calculation match the check digit? If not, the barcode is mistyped or fake.

**Why it matters:** a mistyped barcode fails instantly on the user's phone instead of sending a pointless request across the internet and coming back with nothing.

## 2.6 Two questions I should expect

**"Why not let the AI calculate the calories? It would be simpler."**
It would, and it would sometimes be wrong in a way nobody could detect. We let the AI do the part it is good at, recognising food, and kept the arithmetic ourselves so every number can be traced back to a database entry.

**"What if a food is not in your database?"**
We drop it and the user adds it by hand. That is a deliberate choice: a missing item they notice is much safer than a made-up one they do not.

# 3. Eric La: Training And Workouts

## 3.1 What I built

I own everything to do with exercise: the exercise library and its licensing, generating a weekly training plan, making that plan get harder over time, adapting it when the user has had a hard week, the guided workout screen, and the progress statistics.

## 3.2 Only suggesting exercises the user can actually do

There is no point prescribing a barbell squat to somebody training in a bedroom. Before building a plan, we filter the exercise library down to what the user can actually perform.

```ts
/** True when the exercise needs nothing beyond the user's equipment. */
export function equipmentAllows(exercise: Exercise, userEquipment: Equipment[]): boolean {
  return exercise.equipment.every((e) => e === 'none' || userEquipment.includes(e));
}
```

**Reading the code**

- The function is given one exercise and the list of equipment the user owns.
- `every` means "all of these must be true". So the exercise is allowed only if **every** piece of equipment it needs is either nothing at all, or something the user has.
- One missing item and the exercise is excluded.

We apply the same idea to difficulty, so a beginner is never shown an advanced movement.

## 3.3 Where the exercises come from, and crediting them

Most of our exercise library comes from wger, an open-source exercise database. It is free to use, but its licence requires us to credit the authors. That obligation is easy to satisfy once and then lose accidentally later, so we made the credit part of the exercise record itself.

```ts
    // Attribution — never stripped (AQF-12).
    licence: licence.shortName,
    licenceAuthor: translation.license_author || info.license_author || FALLBACK_AUTHOR,
```

**Reading the code**

- Every exercise we import carries the licence it came under and who wrote it.
- These are ordinary fields on the record, exactly like the exercise name, so they travel with it everywhere in the app.
- The app displays them on the exercise detail screen rather than hiding them.

**Why it matters:** we are using other people's work legally and visibly, and there is an automated test that fails if those fields ever stop appearing.

## 3.4 Making the plan get harder over time

A training plan that never changes stops working. Rather than writing instructions like "in week three, add a set", we store the progression as **data**: a list of rules, each saying which exercise, what to change, and which week it starts.

```ts
      progressionRules.push(
        { slotEntryId: entryId, kind: 'reps', iteration: 2, value: rx.reps + 2 },
        { slotEntryId: entryId, kind: 'sets', iteration: 3, value: clampSets(sets + 1) },
        { slotEntryId: entryId, kind: 'rest', iteration: 4, value: Math.max(30, rx.restSeconds - 15) },
      );
```

**Reading the code**

- Three rules are created for each exercise in the plan.
- Read the first as: for this exercise, change the **reps**, starting in week 2, to the original reps plus 2.
- The second adds a set in week 3. The third shortens the rest by 15 seconds in week 4.
- `clampSets` and `Math.max(30, ...)` are safety limits, so no rule can ever produce something absurd like 40 sets or zero rest.

**Why it matters:** because the plan is data rather than hidden logic, we can show the user what week five will ask of them, and we can test the rules on their own.

## 3.5 Easing off after a hard week

If somebody has had a bad week, holding them to a plan built for a good week is how they end up deleting the app. So before building the plan we score the last seven days and adjust the workload.

```ts
export const READINESS_PROTECT_MAX_SCORE = 39;
export const READINESS_MAINTAIN_MAX_SCORE = 74;
export const READINESS_VOLUME_MULTIPLIER = {
  protect: 0.6,
  maintain: 1,
  progress: 1.1,
} as const;
```

**Reading the code**

- The user's week is scored out of 100, mostly on whether they completed their planned sessions.
- 39 or below is "protect", 40 to 74 is "maintain", above that is "progress".
- The multipliers say what happens to the amount of work: protect drops it to 60 percent, maintain leaves it alone, progress adds 10 percent.

**Why it matters:** the wording throughout this feature was chosen carefully. A lighter week is presented as the app taking work off the user, never as the user having failed.

## 3.6 Measuring strength over time

We estimate the maximum weight a user could lift once, from the sets they actually did. It is a published formula, not a guess of ours.

```ts
/** Brzycki e1RM in kg; undefined outside 1–36 reps or without a load. */
export function brzyckiE1rm(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps < 1 || reps >= 37) return null;
  return Math.round(((weightKg * 36) / (37 - reps)) * 100) / 100;
}
```

**Reading the code**

- Given a weight and how many repetitions were completed, it estimates a one-repetition maximum.
- The first line refuses to answer for values the formula is not valid for, returning `null`, which means "no answer" rather than a wrong one.
- The rounding at the end keeps the result to two decimal places.

We also record **which version of the formula** produced each number. If we ever changed formula without noting it, every past figure a user had seen would shift, and they could not tell an improvement from a change of maths.

## 3.7 Two questions I should expect

**"Why generate the plan with code instead of AI?"**
Because how hard somebody trains has real consequences. Our AI does get a first attempt at writing a week, but whatever it produces is checked against the same rules and the same filtered exercise list, and anything that fails goes back to the code-generated plan without the user noticing.

**"How do you know the workload is safe?"**
Every rule that changes a workout passes through limits on sets, repetitions, rest, weight and effort. Nothing, including the AI, can write a value outside them.

# 4. Babatundji Williams-Fulwood: The Platform Underneath

## 4.1 What I built

I own the parts that every feature sits on: how the app talks to AI providers, the safety checks around the AI, logging in and staying logged in, privacy and data deletion, the progress summaries, the points system, payments, and getting the whole thing running in production.

## 4.2 One place for all AI, and what happens when it fails

Our app uses several AI providers. Rather than naming a specific company throughout the code, every feature asks for a **type of job**, and one central module decides who actually answers.

```ts
/** Logical model groups (AQF-09 §2.3): app code never names real providers. */
export const MODEL_GROUPS = {
  visionPrimary: 'visionPrimary',
  chatFast: 'chatFast',
  planStructured: 'planStructured',
  safetyCheap: 'safetyCheap',
  insightBatch: 'insightBatch',
} as const;
```

**Reading the code**

- These five names are the only vocabulary the rest of the app has for AI. "Look at this picture", "have a conversation", "write a structured plan", "run a cheap safety check", "write a summary".
- No feature knows or cares which company answers. That is decided in one file.

That central module also handles failure. It retries briefly, stops using a provider that keeps failing, gives up after a fixed time limit, and falls back to a built-in offline version so the app still works with no internet AI at all. If we fell back because something broke, the user is not charged for it.

**Why it matters:** changing AI provider is a change to one file, and an AI outage does not take the product down.

## 4.3 Refusing to answer unsafe questions

Every message a user sends to the coach is checked before it goes anywhere near an AI. The order of those checks is deliberate.

```ts
  const crisis = findMatch(text, CRISIS_PATTERNS);
  if (crisis) {
    matched.push(crisis);
    return { category: 'crisis', jailbreak, matched };
  }
```

**Reading the code**

- We check for signs of personal crisis **first**, before anything else.
- If we find any, the function stops immediately and returns "crisis". Nothing else is considered.
- Only if this check passes do we go on to check for medical questions, extreme dieting, and off-topic requests.

The order is the point. A message might mention both distress and food. Someone in that situation must never be handed diet advice, so the crisis check always wins. When it triggers, no AI is called at all, the user gets a supportive message with a real helpline, and they are not charged.

## 4.4 Detecting a stolen login

Users get a short-lived pass to prove who they are, plus a longer-lived one used to renew it. The renewal pass can only be used once. This code is what happens if someone tries to use one twice.

```ts
  if (existing.usedAt !== null || existing.revokedAt !== null) {
    revokeFamily(existing.familyId);
    throw new AppError('AUTH_INVALID', 'Refresh token reuse detected; session revoked');
  }
```

**Reading the code**

- The first line asks: has this pass already been used, or already been cancelled?
- If so, `revokeFamily` cancels **every** pass in that chain, not just this one.
- The user and anyone who stole their pass are both logged out at the same moment.

**Why it matters:** a second use of a single-use pass means two parties hold it, which means it was copied. Logging both out is the correct response: the real user simply signs in again, and the thief gets nothing.

## 4.5 Counting AI usage without a counter

Each user gets a daily allowance of AI credits. We never store a balance as a number that we add to and subtract from.

```ts
    /** Balance = fold. No cached counters, ever. */
    async balance(userId: string): Promise<number> {
      const txs = await userTxs(userId);
      return txs.reduce((sum, t) => sum + (typeof t.amount === 'number' ? t.amount : 0), 0);
    },
```

**Reading the code**

- `userTxs` fetches the user's full list of credit transactions.
- `reduce` adds them all up. That total **is** the balance.
- There is no stored balance anywhere to go wrong.

This works like a bank statement rather than a number written on a whiteboard. Credits are held before an AI job starts and settled after it finishes, so a job that crashes gives the credits back instead of silently charging the user.

## 4.6 Privacy that is off until asked for

The app holds health data, so nothing is switched on by default.

```ts
const DEFAULT_CONSENTS: Omit<ConsentState, 'updatedAt'> = {
  wellnessDataProcessing: false,
  aiPersonalisation: false,
  anonymisedAnalytics: false,
  reminders: false,
};
```

**Reading the code**

- Four separate permissions, every one starting as `false`.
- Nothing is bundled. A user can allow one and refuse the others.

The second one does real work. With `aiPersonalisation` off, none of the user's profile or logs are sent to the AI at all, not even their name. The coach still answers, it just answers generically. Users can also download everything we hold, and delete their account, which happens in two steps with a grace period in case they change their mind.

## 4.7 Two questions I should expect

**"What happens if the AI service goes down during your demonstration?"**
The app keeps working. There is a built-in offline version behind every AI feature, and everything that does not need AI, logging food, workouts, progress, was never dependent on it in the first place.

**"How do you know your safety checks actually work?"**
They are tested automatically. We have a set of deliberately unsafe test messages that run as part of our build, and 770 automated tests overall. Some exist specifically to fail if a safety rule is weakened.

# 5. Facts We Can All Quote

These are the numbers any of us may be asked for. They were taken from the code or from running our tests, not estimated.

| Figure | Value |
| :--- | :--- |
| Automated tests, all passing | 770 |
| Foods in our database | 139 |
| Exercises in our library | 51 |
| Recipes | 17 |
| Allergy types filtered | 9 |
| Lowest calorie target the app will suggest | 1200 or 1500, by sex |
| How long a login pass lasts | 15 minutes |
| Free AI credits per day | 50 |
| Grace period before account deletion | 30 days |

# 6. Three Things We Must Not Say

An early draft of our slides contained three claims our code does not support. They are recorded here so nobody repeats them by mistake.

1. **"We use two different formulas to calculate calories."** We use one, Mifflin-St Jeor. We never collected the body fat measurement the second formula needs.

2. **"The AI generates multi-day meal plans."** It suggests one meal for each of today's four slots. That is a day of suggestions, not a multi-day plan.

3. **"We have 100 percent test coverage."** We have 770 passing tests, which is worth saying and is verifiable. It is not a coverage percentage, and we have not measured one.

Also, do not read numbers off the diagnostics panel during a demonstration. One of the figures there is genuinely measured and the others are placeholders, and we should only quote numbers we can stand behind.
