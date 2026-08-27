import com.android.build.api.dsl.ApplicationExtension
import fit.aquazero.buildlogic.AzfConfig
import fit.aquazero.buildlogic.configureKotlin
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure

/** Baseline for the single `:app` module. */
class AndroidApplicationConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.android.application")
        pluginManager.apply("org.jetbrains.kotlin.android")

        extensions.configure<ApplicationExtension> {
            compileSdk = AzfConfig.COMPILE_SDK
            defaultConfig {
                minSdk = AzfConfig.MIN_SDK
                targetSdk = AzfConfig.TARGET_SDK
                testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
            }
            compileOptions {
                sourceCompatibility = AzfConfig.JAVA_VERSION
                targetCompatibility = AzfConfig.JAVA_VERSION
            }
            buildFeatures {
                buildConfig = true
                aidl = false
                shaders = false
            }
        }
        configureKotlin()
    }
}
