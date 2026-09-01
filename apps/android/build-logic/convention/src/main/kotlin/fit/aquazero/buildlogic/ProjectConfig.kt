package fit.aquazero.buildlogic

import org.gradle.api.JavaVersion

/**
 * Single source of truth for the SDK and JVM levels. Changing a number here
 * changes it for every module at once; no module may override these locally.
 */
object AzfConfig {
    const val COMPILE_SDK = 37
    const val MIN_SDK = 26
    const val TARGET_SDK = 36

    val JAVA_VERSION = JavaVersion.VERSION_17
    const val JVM_TOOLCHAIN = 17

    /** Package prefix; each module appends its own segment. */
    const val NAMESPACE_PREFIX = "fit.aquazero.app"
}
