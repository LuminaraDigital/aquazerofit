package fit.aquazero.app

import android.app.Application
import android.content.Context
import androidx.test.runner.AndroidJUnitRunner
import dagger.hilt.android.testing.HiltTestApplication

/**
 * The instrumentation runner named by `testInstrumentationRunner`.
 *
 * It swaps [AzfApplication] for [HiltTestApplication] before any test class is
 * loaded. Without it every instrumented test would boot the real application:
 * `onCreate` starts the connectivity-driven sync trigger and the telemetry
 * consent gate, and the real `NetworkModule` graph it carries would put live
 * HTTP behind any screen a test happens to render. Tests would then depend on
 * a reachable dev server and on Firebase initialising — the two things an
 * on-device suite must never need.
 *
 * Hilt tests still get a full DI graph; it is just one assembled per test, so
 * `@UninstallModules` / `@TestInstallIn` can replace the network edge.
 */
class AzfTestRunner : AndroidJUnitRunner() {

    override fun newApplication(
        classLoader: ClassLoader?,
        className: String?,
        context: Context?,
    ): Application = super.newApplication(classLoader, HiltTestApplication::class.java.name, context)
}
