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

// One module.
//
// The app is a single `:app` module whose layering is by package: `core/*`
// below `feature/*`, with no feature importing another and nothing under
// `core` importing a feature. That invariant currently holds by convention and
// a grep rather than by the compiler — see the README's Architecture section
// for the check.
//
// Splitting it into per-layer Gradle modules is planned and fully specified in
// docs/plans/ANDROID_MODULARISATION.md, which carries the measured dependency
// graph and the execution order. The build files for that split are NOT kept
// on disk in the meantime: build files for modules with no source are never
// configured, so nothing validates them, and they misrepresent a single-module
// build as a multi-module one. They are cheap to write from the plan when the
// sources actually move.
include(":app")
