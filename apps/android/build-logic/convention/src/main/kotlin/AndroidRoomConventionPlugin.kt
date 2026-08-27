import androidx.room.gradle.RoomExtension
import fit.aquazero.buildlogic.lib
import fit.aquazero.buildlogic.libs
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies

/**
 * Room with schema export switched on and the schema directory under version
 * control.
 *
 * Exported schemas are what make `MigrationTestHelper` tests possible; a
 * migration bug that ships is unrecoverable on user devices, so this is not
 * optional and destructive fallback is forbidden.
 */
class AndroidRoomConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.google.devtools.ksp")
        pluginManager.apply("androidx.room3")

        extensions.configure<RoomExtension> {
            schemaDirectory("$projectDir/schemas")
        }

        dependencies {
            add("implementation", libs.lib("room3-runtime"))
            add("ksp", libs.lib("room3-compiler"))
        }
    }
}
