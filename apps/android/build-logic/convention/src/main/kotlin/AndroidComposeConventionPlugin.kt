import com.android.build.api.dsl.ApplicationExtension
import com.android.build.api.dsl.LibraryExtension
import fit.aquazero.buildlogic.lib
import fit.aquazero.buildlogic.libs
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.dependencies

/**
 * Adds Compose to a module that already applies `azf.android.library` or
 * `azf.android.application`. Every module resolves the SAME Compose BOM, so
 * two modules can never end up on different Compose versions.
 *
 * The application and library extensions are handled separately on purpose:
 * matching on the concrete types avoids depending on `CommonExtension`'s
 * generic arity, which has changed between AGP major versions.
 */
class AndroidComposeConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("org.jetbrains.kotlin.plugin.compose")

        val library = extensions.findByType(LibraryExtension::class.java)
        val application = extensions.findByType(ApplicationExtension::class.java)

        when {
            library != null -> library.buildFeatures.apply {
                compose = true
                // azf.android.library switches resources off by default; a
                // Compose UI module needs them back for themes and drawables.
                androidResources = true
            }
            application != null -> application.buildFeatures.compose = true
            else -> error(
                "azf.android.compose requires azf.android.library or azf.android.application",
            )
        }

        dependencies {
            val bom = platform(libs.lib("androidx-compose-bom"))
            add("implementation", bom)
            add("androidTestImplementation", bom)
            add("implementation", libs.lib("androidx-compose-ui"))
            add("implementation", libs.lib("androidx-compose-ui-tooling-preview"))
            add("implementation", libs.lib("androidx-compose-material3"))
            add("debugImplementation", libs.lib("androidx-compose-ui-tooling"))
        }
    }
}
