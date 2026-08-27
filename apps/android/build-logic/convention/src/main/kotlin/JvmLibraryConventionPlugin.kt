import fit.aquazero.buildlogic.AzfConfig
import fit.aquazero.buildlogic.configureKotlin
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.plugins.JavaPluginExtension
import org.gradle.kotlin.dsl.configure

/**
 * Pure Kotlin/JVM module — no Android framework on the classpath at all.
 *
 * `:core:model` uses this. It is an architectural guarantee, not an
 * optimisation: domain models physically cannot reach for a Context, and the
 * module compiles without the Android toolchain.
 */
class JvmLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("org.jetbrains.kotlin.jvm")

        extensions.configure<JavaPluginExtension> {
            sourceCompatibility = AzfConfig.JAVA_VERSION
            targetCompatibility = AzfConfig.JAVA_VERSION
        }
        configureKotlin()
    }
}
