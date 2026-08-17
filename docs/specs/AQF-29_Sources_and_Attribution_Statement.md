---
logo: design/brand/AquaZeroFit(single_Logo).png
brand: AquaZero
tagline: AI Wellness Assistant
unit: NIT3004 IT Capstone Project 2
title: Sources and Attribution Statement
subtitle: The external work that informed AquaZeroFit, what we took from it, and the licence our own code carries
details:
  Document ID: AQF-29
  Project: AquaZeroFit, an AI-powered wellness platform (web and Telegram Mini App)
  Repository: https://github.com/LuminaraDigital/aquazerofit
  Prepared by: Babatundji Williams-Fulwood, Eric La, Victor Hong
  Group: Group 15, Victoria University, Melbourne
  Date: 17 August 2026
  Project licence: GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)
  Related documents: AQF-12 Upstream Integration and Licensing Register, AQF-12A wger Integration Addendum
  Status: Issued
---

# 1. Purpose and Scope

This is a short, auditable statement of every external source that informed AquaZeroFit: the datasets we imported, the open-source projects we studied, the artificial intelligence models we call, the typefaces and icons we render, and the software libraries we build on. For each one it records three things: what we took, what we deliberately did not take, and the obligation that attaches.

It also states plainly, in section 3, the licence AquaZeroFit itself is published under and what that licence commits us to.

The document is deliberately brief. It is a register, not an argument. Where a source carries obligations complex enough to need reasoning, that reasoning already exists in AQF-12 (Upstream Integration and Licensing Register) and AQF-12A (wger Integration Addendum), and this statement cross-references rather than repeats it.

## 1.1 Declaration of originality

AquaZeroFit is our own work. The application architecture, the data model, the API contract, the deterministic nutrition and training engines, the safety guardrail pipeline, the prompt bank, the user interface and the test suite were designed and written by the three authors named on the cover.

External projects were used in exactly two ways, and this document distinguishes them throughout:

1. **As inspiration.** We read publicly documented design patterns, domain models and API contracts, then reimplemented the underlying ideas independently in our own architecture and our own code. No third-party application source code is vendored, copied, linked or shipped in this repository. Ideas, algorithms and data schemas are not themselves copyrightable, and a clean-room reimplementation of a documented pattern is lawful; a copied file is not, and we have not copied any.
2. **As data.** We imported openly licensed reference data (exercise records and their media, food composition records) over public APIs, preserving the per-record licence and author fields that came with it. That data remains the property of its contributors under its own licence. It is credited in the product, not absorbed by it.

Nothing in this register transfers ownership of AquaZeroFit's own code to any third party, and nothing in AquaZeroFit's own licence re-licenses any third party's data.

# 2. Project Repository

The complete source history of the project, including every commit that produced the evidence cited in our other reports, is public:

**https://github.com/LuminaraDigital/aquazerofit**

| Item | Location in the repository |
| :--- | :--- |
| Project licence, full text | `LICENSE` |
| Licence identifier, machine readable | `package.json`, field `license` |
| Third-party software notices | `THIRD_PARTY_NOTICES.md` |
| Human-facing content attribution record | `content/ATTRIBUTION.md` |
| Upstream integration and licensing register | `docs/specs/AQF-12_Upstream_Integration_and_Licensing_Register.docx` |
| wger integration addendum | `docs/specs/AQF-12A_wger_Integration_Addendum.md` |
| Per-record attribution fields as imported | `apps/api/src/data/import-attribution.wger.json` |
| Continuous integration, including the licence gate | `.github/workflows/ci.yml` |

A reader wishing to verify any claim in this document should start at those files. They are the primary evidence; this statement is a summary of them.

# 3. The Licence AquaZeroFit Carries

**AquaZeroFit is licensed under the GNU Affero General Public License, version 3.0 or later (AGPL-3.0-or-later).** The full text is in `LICENSE`; the machine-readable identifier is declared in `package.json`.

## 3.1 What the AGPL requires

The AGPL is the GNU General Public License version 3 plus one additional clause, section 13, which exists specifically for software that people use over a network rather than install on their own machine. AquaZeroFit is exactly that kind of software: a hosted web application and a Telegram Mini App. In practical terms the licence commits us, and anyone who takes the project further, to the following.

| Obligation | What it means in practice |
| :--- | :--- |
| Source availability on distribution | Anyone who receives a copy of the software receives, or is offered, the complete corresponding source code. |
| Source availability on network use (section 13) | Anyone who merely *interacts with a modified version over a network*, without ever receiving a copy, must still be offered the corresponding source of that modified version. This is the clause that distinguishes the AGPL from the ordinary GPL, and it is the reason it fits a hosted product. |
| Same licence downstream | Modified and derived works must themselves be licensed AGPL-3.0-or-later. The freedom cannot be removed by a later contributor. |
| Notices preserved | Copyright notices, licence notices and warranty disclaimers travel with the code. |
| Modifications marked | Changed files carry prominent notice of the change and its date. |
| No additional restrictions | Downstream recipients cannot be bound by extra terms that narrow the rights the licence grants them. |

## 3.2 Why we chose it

Three reasons, in order of weight.

1. **Reciprocity with the commons we drew from.** The exercise corpus that gives the product its training library is community-contributed data published under Creative Commons share-alike terms, and the food composition data is published under the Open Database License, which is also a share-alike licence. A project built substantially on share-alike community data, and then closed off, takes from that commons without returning to it. Licensing our own work under a copyleft licence keeps the exchange symmetrical.
2. **It matches the network shape of the product.** A permissive licence such as MIT would allow a third party to host a modified AquaZeroFit as a service and never publish a line of the modification, because no copy is ever distributed. Section 13 closes that gap. Since the product is delivered as a hosted service, an ordinary GPL would have left the same gap open.
3. **Domain precedent.** The most mature open project in this domain, wger, is itself AGPL-3.0-or-later. Choosing the same licence places AquaZeroFit in the same licensing neighbourhood as the ecosystem it sits in, and removes any future compatibility barrier should the project and that ecosystem ever converge.

## 3.3 What the AGPL does not do

This is the point most often misread, so it is stated explicitly.

> [!Important]
> The AGPL governs **AquaZeroFit's own source code**. It does not, and legally cannot, re-license third-party material that the software merely uses, imports or displays.
>
> Creative Commons exercise data stays Creative Commons. Open Food Facts data stays under the Open Database License. Fonts stay under the SIL Open Font License. Each third-party licence in section 4 continues to govern its own material on its own terms, independently of the licence we chose for ours.

Nor is AGPL "viral" across the boundary of a separate program. Calling a hosted inference API over HTTP, or importing data over a public REST endpoint, does not make the remote service part of our work or our work part of it.

## 3.4 The effect of the licence change on our upstream policy

An earlier revision of this project was not copyleft, and AQF-12 recorded a hard exclusion on AGPL-licensed source code on compatibility grounds (ADR-013). Now that AquaZeroFit is itself AGPL-3.0-or-later, that compatibility constraint no longer applies.

**The exclusion nevertheless stands, now as an architectural decision rather than a legal one.** No wger source code is vendored, and none will be adopted without re-opening AQF-12. Keeping the two codebases free of any derivation relationship means our contribution claims stay unambiguous and independently verifiable, which matters more to an assessed capstone project than the convenience of borrowing code would. AQF-12A section 2, obligation 1, records the control that enforces this.

# 4. Register of Sources

## 4.1 Exercise library and media data

**wger Workout Manager**, the primary exercise corpus and the source of the demonstration media in the workout library.

| Item | Reference |
| :--- | :--- |
| Project site | https://wger.de |
| Application source repository | https://github.com/wger-project/wger |
| REST API consumed | https://wger.de/api/v2/ |
| API documentation | https://wger.readthedocs.io/en/latest/api/api.html |
| Data licence | Creative Commons, assigned **per record**: CC-BY-SA 3.0, CC-BY-SA 4.0, CC-BY 4.0 or CC0 |
| Application code licence | AGPL-3.0-or-later |

**What we took.** Exercise records, translations, muscle and equipment taxonomies, images and videos, imported over the public API into a server-side mirror. Each record's own `license` and `license_author` values are copied verbatim into our `licence` and `licenceAuthor` fields and are never stripped by any pipeline (AQF-06 section 3.3). We also studied the documented domain model, including progression rules, the training slot model and estimated one-rep-max statistics, and reimplemented those ideas independently.

**What we did not take.** Any line of wger application source code. The integration is a data import plus an independent reimplementation, and nothing else.

**Obligations discharged.** Per-record attribution is rendered in the product on the exercise detail sheet as "© {author}, {licence}, via wger.de", both under the description and beneath each media item. The collective notice lives in `content/ATTRIBUTION.md`. Legacy records that ship with an empty author field are attributed to "wger community contributors, CC-BY-SA 3.0", which is wger's own convention, and the gray zone is documented rather than hidden. Because CC-BY-SA is a share-alike licence, any AI translation or rewrite of a wger description is an adaptation and is itself CC-BY-SA, with attribution required to survive into the generated text; an evaluation fixture in `evals/` gates this.

Media is mirrored and served from our own origin rather than hotlinked, and production reads never touch wger.de at request time. This is a courtesy to a volunteer-run community instance as much as an availability decision (AQF-12A section 4).

## 4.2 Food and nutrition data

**Open Food Facts**, the primary ingredient and barcode database.

| Item | Reference |
| :--- | :--- |
| Project site | https://world.openfoodfacts.org |
| API documentation | https://openfoodfacts.github.io/openfoodfacts-server/api/ |
| Bulk data export | https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz |
| Licence | Database: Open Database License 1.0. Contents: Database Contents License. Product images: CC-BY-SA 3.0 |

**What we took.** Product names, macronutrients per 100 g, barcodes, Nutri-Score, dietary flags, serving units and crowdsourced allergen tags.

**Obligations discharged.** Each product shown in the application is credited "© Open Food Facts contributors" with a link back to its product page. Open Food Facts data is held in a segregated `foodsOff` container and is never commingled with our own records, which keeps the share-alike duty attached to that collective database rather than to the whole store (ODbL section 4.5a). The derived dataset is not paywalled or restricted beyond ODbL's own terms. Allergen tags are displayed as best-effort crowdsourced information and never override our own deterministic curated allergen filter, which is a safety requirement, not a licensing one (AQF-11).

**USDA FoodData Central**, reserved as a laboratory-grade whole-food reference layer.

| Item | Reference |
| :--- | :--- |
| Project site | https://fdc.nal.usda.gov |
| API guide | https://fdc.nal.usda.gov/api-guide |
| Licence | Public domain, CC0 1.0 |

Reserved in a separate `foodsFdc` container and not yet ingested. Being CC0, it carries no attribution duty and no share-alike exposure; should it be ingested we intend to credit it voluntarily as "Data courtesy of USDA FoodData Central".

## 4.3 Upstream repositories consulted as development precedent

These repositories were **read**, not used. They informed our understanding of the domain, the shape of a fitness data model and the operational concerns of running such a service. Nothing from them is present in our codebase.

| Repository | Licence | What we drew from it |
| :--- | :--- | :--- |
| https://github.com/wger-project/wger | AGPL-3.0-or-later | Domain model and REST contract, as documented precedent for our own independent design |
| https://github.com/wger-project/flutter | AGPL-3.0-or-later | How a client consumes the same API surface, informing our own client and caching design |
| https://github.com/wger-project/docker | AGPL-3.0-or-later | Reference for how the upstream service is composed and operated, informing our deployment reasoning (AQF-21) |
| https://github.com/wger-project/docs | Documentation licence per repository | API semantics, field meanings and the per-record licensing model that our ETL had to honour |

## 4.4 Artificial intelligence models and inference providers

AquaZeroFit does not train, fine-tune, host or redistribute any model. It calls hosted inference APIs, and it falls back to a deterministic offline engine when no provider key is configured. There is no Hugging Face Hub client library, no model weight file and no dataset download anywhere in the repository; this was verified by search across the whole tree before this document was issued.

Hugging Face is relevant to this register in one specific and honest way: it is the **canonical publication point for the model cards, weights and licence texts of the open-weight models we call**. The models below are open-weight models from Meta's Llama family, published on Hugging Face, which we reach through third-party hosted inference. We record the Hugging Face model identifiers so that the exact model behind each task lane, and the licence governing it, can be looked up rather than guessed.

| Task lane in our gateway | Model | Hugging Face model identifier | Model licence | Reached through |
| :--- | :--- | :--- | :--- | :--- |
| Vision, primary | Llama 4 Scout 17B 16E Instruct | `meta-llama/Llama-4-Scout-17B-16E-Instruct` | Llama 4 Community License | Groq |
| Vision, alternate | Llama 3.2 90B Vision Instruct | `meta-llama/Llama-3.2-90B-Vision-Instruct` | Llama 3.2 Community License | NVIDIA NIM |
| Chat, plans, insights | Llama 3.3 70B Instruct | `meta-llama/Llama-3.3-70B-Instruct` | Llama 3.3 Community License | Groq, NVIDIA NIM |
| Safety screening, low cost | Llama 3.1 8B Instruct | `meta-llama/Llama-3.1-8B-Instruct` | Llama 3.1 Community License | Groq, NVIDIA NIM, Ollama |

The gateway also supports two closed-weight commercial families, which have no open weights and therefore no model card of this kind: OpenAI (`gpt-4o`, `gpt-4o-mini`) and Google Gemini (`gemini-2.0-flash`, `gemini-2.0-flash-lite`). Their use is governed by the respective provider API terms.

| Provider | Reference | Role |
| :--- | :--- | :--- |
| Groq | https://console.groq.com | Primary hosted inference for the Llama family |
| NVIDIA NIM | https://build.nvidia.com | Secondary hosted inference, OpenAI-compatible endpoint |
| Ollama | https://ollama.com | Local or self-hosted inference, used for offline development |
| OpenAI | https://platform.openai.com | Optional commercial provider |
| Google Gemini | https://aistudio.google.com | Optional commercial provider |

**Obligations noted.** Because we call these models as a service and redistribute neither weights nor a derived model, the Llama Community Licenses impose no source-level duty on our repository. Two runtime duties do apply and are recorded here so they are not forgotten at release: the acceptable use policy attached to each Llama Community License binds how the product may use the model, and those licences require a product built with Llama to display a "Built with Llama" acknowledgement. The second is a product surface item, tracked against the in-app attribution page.

Model output is never trusted for arithmetic. Calorie, macronutrient and hydration figures are computed deterministically in our own code; the model is used for recognition and language only. That is a safety decision documented in AQF-11 and AQF-28, and it also limits how far any model licence could reach into the product's results.

## 4.5 Typography and iconography

| Asset | Source | Licence |
| :--- | :--- | :--- |
| Barlow Condensed | https://fonts.google.com/specimen/Barlow+Condensed | SIL Open Font License 1.1 |
| DM Sans | https://fonts.google.com/specimen/DM+Sans | SIL Open Font License 1.1 |
| Material Symbols Outlined | https://fonts.google.com/icons | Apache License 2.0 |

The SIL Open Font License permits embedding and redistribution and requires that the fonts are not sold on their own and that reserved font names are not reused for modified versions. We do neither. No font file has been modified or renamed.

## 4.6 Software libraries

The application is built on open-source packages, every one of which is MIT, Apache-2.0, BSD or ISC licensed. The full list, with the role each package plays, is maintained in `THIRD_PARTY_NOTICES.md` and is not duplicated here. The principal ones are React, React Router and TanStack Query on the client; Express, Zod, Helmet, jsonwebtoken, bcryptjs, sharp and pg on the server; and TypeScript, Vite, Tailwind CSS and Vitest across the toolchain.

The licence allowlist (MIT, Apache-2.0, BSD, ISC) is re-verified as a release gate. No copyleft-licensed library is present in the dependency tree, which keeps the copyleft in this project a deliberate choice about our own code rather than an inherited obligation.

## 4.7 Platform services

| Service | Reference | Role |
| :--- | :--- | :--- |
| Telegram Mini Apps | https://core.telegram.org/bots/webapps | Second delivery target, launch-data validation and Stars payments |
| Cloudflare Turnstile | https://developers.cloudflare.com/turnstile/ | Bot protection on account creation and password reset |
| Resend | https://resend.com | Transactional mail transport for password reset |

`telegram-web-app.js` is loaded from Telegram's own origin under the Telegram Mini Apps terms and is not vendored into the repository.

# 5. Source Use Matrix

The register above, reduced to one table. This is the summary a reader short of time should take away.

| Source | Used as | Taken | Explicitly not taken | Where the obligation is discharged |
| :--- | :--- | :--- | :--- | :--- |
| wger | Data and inspiration | Exercise records, translations, media, taxonomies, documented domain patterns | All application source code | In-app per-record credit, `content/ATTRIBUTION.md`, AQF-12A |
| Open Food Facts | Data | Product composition, barcodes, allergen tags | Nothing withheld; data is segregated, not absorbed | Per-product credit and link, segregated container |
| USDA FoodData Central | Data, reserved | Nothing yet ingested | Not applicable | CC0, voluntary credit if ingested |
| wger flutter, docker, docs repositories | Inspiration only | Understanding of API semantics and operations | All source code and configuration | No obligation attaches to reading |
| Meta Llama models | Inference only | Model responses at runtime | Weights, fine-tuning, redistribution | Acceptable use policy, "Built with Llama" acknowledgement |
| OpenAI, Google Gemini | Inference only | Model responses at runtime | Not applicable | Provider API terms |
| Google Fonts | Assets | Three font families | No modification, no renaming | SIL OFL 1.1 and Apache-2.0 terms observed |
| Open-source libraries | Dependencies | Runtime and build functionality | No copyleft dependencies | `THIRD_PARTY_NOTICES.md`, CI licence gate |

# 6. How Attribution Reaches the User

Attribution that exists only in a document is not attribution. In AquaZeroFit it is carried by the data itself and rendered in the interface.

- Every imported record stores `licence`, `licenceAuthor` and `sourceId`. These fields are populated by the import and are never stripped by any downstream pipeline. Removing them is classified as a release-blocking defect, not a cosmetic one (AQF-06 section 3.3).
- The exercise detail sheet renders "© {author}, {licence}, via wger.de" beneath the description and beneath each image or video.
- The exercise library carries a persistent link to the attribution page.
- The in-app attribution page holds the collective wger notice, the Open Food Facts notice and a link to `content/ATTRIBUTION.md`.
- Every food product view credits "© Open Food Facts contributors" and links to its source page.
- Generated plan and coaching text must retain attribution for any exercise drawn from the imported corpus. This is enforced by an evaluation fixture in the pipeline, not by reviewer diligence.
- Records reused from the mirrored upstream media set keep their upstream licence, author and AI-disclosure values read verbatim at load time, so reuse never launders a record's provenance.

# 7. What Is Entirely Our Own

For completeness, and so that the register above is not read as a larger claim than it is, the following contain no third-party material of any kind:

- The deterministic nutrition engine: calorie targets, macronutrient splits, hydration and every figure the user is shown as a number.
- The training plan engine and progression logic, written to our own design.
- The safety guardrail pipeline, the prompt bank (P-01 to P-11) and the evaluation sets that gate them.
- The API contract, the data model and the shared validation schemas.
- The complete user interface, the brand system and the marketing and legal pages.
- The Heavens design work and its associated documents.
- All seeded recipes, which are original works created for this project.
- The full test suite and the continuous integration configuration.

# 8. Maintenance of This Register

This document is the summary layer. The authoritative records are AQF-12 and AQF-12A, and any new upstream source must be entered there before it is used, not after. The controls that keep the register honest are the dependency licence allowlist checked at every release gate, the repository scan for vendored upstream code, and the evaluation fixture that fails the build if attribution is dropped from generated content.

Any future decision to adopt third-party source code rather than data requires AQF-12 to be re-opened and the decision re-ratified. That gate has not been used, and no such adoption has occurred.

# 9. Reference List

Cloudflare 2026, *Turnstile documentation*, viewed 17 August 2026, https://developers.cloudflare.com/turnstile/.

Free Software Foundation 2007, *GNU Affero General Public License, version 3*, Free Software Foundation, Boston, viewed 17 August 2026, https://www.gnu.org/licenses/agpl-3.0.html.

Google 2026, *Google Fonts*, viewed 17 August 2026, https://fonts.google.com.

Google 2026, *Gemini API documentation*, viewed 17 August 2026, https://aistudio.google.com.

Groq 2026, *Groq Cloud API documentation*, viewed 17 August 2026, https://console.groq.com.

Meta 2024, *Llama 3.1 Community License Agreement*, viewed 17 August 2026, https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct.

Meta 2024, *Llama 3.3 Community License Agreement*, viewed 17 August 2026, https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct.

Meta 2025, *Llama 4 Community License Agreement*, viewed 17 August 2026, https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct.

NVIDIA 2026, *NVIDIA NIM API catalogue*, viewed 17 August 2026, https://build.nvidia.com.

Open Data Commons 2009, *Open Database License (ODbL) v1.0*, viewed 17 August 2026, https://opendatacommons.org/licenses/odbl/1-0/.

Open Food Facts 2026, *Open Food Facts API documentation*, viewed 17 August 2026, https://openfoodfacts.github.io/openfoodfacts-server/api/.

SIL International 2007, *SIL Open Font License, version 1.1*, viewed 17 August 2026, https://openfontlicense.org.

Telegram 2026, *Telegram Mini Apps documentation*, viewed 17 August 2026, https://core.telegram.org/bots/webapps.

United States Department of Agriculture 2026, *FoodData Central API guide*, viewed 17 August 2026, https://fdc.nal.usda.gov/api-guide.

wger Project 2026, *wger Workout Manager*, viewed 17 August 2026, https://wger.de.

wger Project 2026, *wger REST API documentation*, viewed 17 August 2026, https://wger.readthedocs.io/en/latest/api/api.html.

wger Project 2026, *wger source repository*, viewed 17 August 2026, https://github.com/wger-project/wger.

Williams-Fulwood, B, La, E & Hong, V 2026, *AquaZeroFit source repository*, Victoria University, Melbourne, viewed 17 August 2026, https://github.com/LuminaraDigital/aquazerofit.
