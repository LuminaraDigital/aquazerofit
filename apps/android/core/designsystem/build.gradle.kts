plugins {
    id("azf.android.library")
    id("azf.android.compose")
}

android { namespace = "fit.aquazero.app.core.designsystem" }

// Brand-agnostic building blocks only: colour, type, motion, spacing and the
// atomic components. Anything that knows what a "meal" or an "XP level" is
// belongs in :core:ui instead.
dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
}
