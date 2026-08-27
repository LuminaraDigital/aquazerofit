plugins {
    id("azf.android.library")
    id("azf.android.hilt")
}

android { namespace = "fit.aquazero.app.core.common" }

dependencies {
    implementation(projects.core.model)
    implementation(libs.androidx.core.ktx)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
