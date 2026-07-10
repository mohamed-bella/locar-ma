plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.rentiq.system"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.rentiq.system"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "SUPABASE_URL", "\"https://hcgewqjymxylklavktph.supabase.co\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZ2V3cWp5bXh5bGtsYXZrdHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNTkyMzIsImV4cCI6MjA5ODczNTIzMn0.mSTHPNeGv_crmD2ky0cjjBbrpE7vqJvxHU9272SDCco\"")
        buildConfigField("String", "R2_PUBLIC_URL", "\"https://pub-c5eff1eef0cf4dd8a671d0798d430d67.r2.dev\"")
        buildConfigField("String", "WEBAPP_BASE_URL", "\"https://app.rentiq-system.com\"")
        buildConfigField("String", "R2_ACCOUNT_ID", "\"912e2c5173432f05bb3c5682f6bbb8ee\"")
        buildConfigField("String", "R2_ACCESS_KEY_ID", "\"4e0ef37771ce6e7fc653fb7f52b9017b\"")
        buildConfigField("String", "R2_SECRET_ACCESS_KEY", "\"ad59ea7ea47da8ab709f7d38ff34a88fb222b53cba003e52e5ff535a67180e55\"")
        buildConfigField("String", "R2_BUCKET", "\"locar\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        viewBinding = true
        buildConfig = true
    }
}

dependencies {
    // AndroidX
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Material (conservative — we override the theme to look pre-2020)
    implementation("com.google.android.material:material:1.12.0")

    // Networking
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // Image loading
    implementation("io.coil-kt:coil:2.7.0")

    // QR code generation (offline, for signature links)
    implementation("com.google.zxing:core:3.5.3")
}
