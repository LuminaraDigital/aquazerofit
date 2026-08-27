// Composite build holding this project's Gradle convention plugins.
//
// Every module's build script is a declaration of *what* it is
// (`azf.android.feature`), never a copy of *how* it is configured. Shared
// compiler flags, SDK levels, Compose and Hilt wiring live here exactly once,
// so 15 modules cannot drift apart.
dependencyResolutionManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("androidx.*")
                includeGroupByRegex("com\.android.*")
                includeGroupByRegex("com\.google.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
    versionCatalogs {
        create("libs") {
            from(files("../gradle/libs.versions.toml"))
        }
    }
}

rootProject.name = "build-logic"
include(":convention")
