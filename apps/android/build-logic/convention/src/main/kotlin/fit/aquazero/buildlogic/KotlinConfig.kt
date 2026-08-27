package fit.aquazero.buildlogic

import org.gradle.api.Project
import org.gradle.api.provider.Provider
import org.gradle.api.artifacts.VersionCatalog
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.api.artifacts.MinimalExternalModuleDependency
import org.gradle.kotlin.dsl.getByType
import org.gradle.kotlin.dsl.withType
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

/** The shared `libs` version catalog, reachable from a convention plugin. */
val Project.libs: VersionCatalog
    get() = extensions.getByType<VersionCatalogsExtension>().named("libs")

fun VersionCatalog.lib(alias: String): Provider<MinimalExternalModuleDependency> =
    findLibrary(alias).orElseThrow {
        IllegalStateException("Version catalog entry '$alias' is missing from libs.versions.toml")
    }

/**
 * Kotlin compiler settings applied to every module.
 *
 * `allWarningsAsErrors` is opt-in via `-Pazf.warningsAsErrors=true` rather than
 * always-on: CI turns it on so no new warning can land, while a local build
 * stays workable when a dependency bump deprecates something mid-task.
 */
fun Project.configureKotlin() {
    tasks.withType(KotlinCompile::class.java).configureEach {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
            allWarningsAsErrors.set(
                providers.gradleProperty("azf.warningsAsErrors").map { it.toBoolean() }.orElse(false),
            )
            freeCompilerArgs.addAll(
                // Opt in to the coroutines/Compose APIs the app relies on, once,
                // instead of scattering @OptIn across feature code.
                "-opt-in=kotlin.RequiresOptIn",
            )
        }
    }
}
