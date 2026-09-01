import fit.aquazero.buildlogic.lib
import fit.aquazero.buildlogic.libs
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.dependencies

/**
 * What every `:feature:*` module is, expressed once.
 *
 * A feature gets the core layers it is allowed to see — and nothing else.
 * Note the absence of `:core:network`: features talk to repositories in
 * `:core:data`, never to the HTTP layer, and the build now enforces that
 * rather than trusting review to catch it.
 *
 * Features must NOT depend on one another. Shared UI belongs in `:core:ui`.
 */
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("azf.android.library")
        pluginManager.apply("azf.android.compose")
        pluginManager.apply("azf.android.hilt")

        dependencies {
            add("implementation", project(":core:model"))
            add("implementation", project(":core:common"))
            add("implementation", project(":core:designsystem"))
            add("implementation", project(":core:ui"))
            add("implementation", project(":core:data"))

            add("implementation", libs.lib("androidx-hilt-navigation-compose"))
            add("implementation", libs.lib("androidx-lifecycle-runtime-compose"))
            add("implementation", libs.lib("androidx-lifecycle-viewmodel-compose"))

            add("testImplementation", libs.lib("junit"))
            add("testImplementation", libs.lib("kotlinx-coroutines-test"))
        }
    }
}
