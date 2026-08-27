import com.android.build.api.dsl.LibraryExtension
import fit.aquazero.buildlogic.AzfConfig
import fit.aquazero.buildlogic.configureKotlin
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure

/**
 * Baseline for every `:core:*` Android library module.
 *
 * Deliberately does NOT enable Compose or Hilt — a module opts into those by
 * also applying `azf.android.compose` / `azf.android.hilt`, so a data-only
 * module never pays the Compose compiler cost.
 */
class AndroidLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.android.library")
        pluginManager.apply("org.jetbrains.kotlin.android")

        extensions.configure<LibraryExtension> {
            compileSdk = AzfConfig.COMPILE_SDK
            defaultConfig {
                minSdk = AzfConfig.MIN_SDK
                testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
            }
            compileOptions {
                sourceCompatibility = AzfConfig.JAVA_VERSION
                targetCompatibility = AzfConfig.JAVA_VERSION
            }
            // Library modules ship no BuildConfig: anything configurable is
            // passed in from :app rather than baked into a core module.
            buildFeatures {
                buildConfig = false
                androidResources = false
            }
        }
        configureKotlin()
    }
}
