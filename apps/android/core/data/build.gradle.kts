plugins {
    id("azf.android.library")
    id("azf.android.hilt")
}

android { namespace = "fit.aquazero.app.core.data" }

// The only layer that sees both the database and the network. Features depend
// on this and never on :core:network.
dependencies {
    api(projects.core.model)
    implementation(projects.core.common)
    implementation(projects.core.database)
    implementation(projects.core.network)
    implementation(projects.core.auth)
    implementation(projects.core.sync)
    implementation(libs.androidx.work.runtime.ktx)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
