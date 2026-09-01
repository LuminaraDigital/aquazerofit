pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("androidx.*")
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google {
            content {
                includeGroupByRegex("androidx.*")
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
            }
        }
        mavenCentral()
    }
}

plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "AquaZeroFit"

// One module, deliberately — for now.
//
// The app is a single `:app` module whose layering is by package:
// `core/*` below `feature/*`, with no feature importing another and nothing
// under `core` importing a feature. That invariant currently holds by
// convention and a grep, not by the compiler.
//
// `build-logic/` and the 17 module build files under `core/` and `feature/`
// are Phase 2 of docs/plans/ANDROID_MODULARISATION.md: written, reviewed and
// intentionally INERT until the sources move. They are not dead code and not
// an abandoned refactor — they are the next phase, staged. Nothing here
// includes them, so they cost nothing at configuration time; `./gradlew
// projects` lists exactly one module.
//
// Turning them on is not a one-line change: it needs the sources extracted
// bottom-up per that document's graph, the 1,244-entry string table
// partitioned in one pass (library modules cannot see `fit.aquazero.app.R`),
// version-catalog entries for the AGP/Kotlin/KSP/Hilt/Compose Gradle plugins,
// and `enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")` for the `projects.*`
// accessors those build files already use. Doing it halfway is worse than not
// starting, so it waits for a tree nobody else is writing to.
include(":app")
