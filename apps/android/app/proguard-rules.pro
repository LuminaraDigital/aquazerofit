# AquaZeroFit release keep rules.
# Minify + resource shrinking are ON; these rules keep exactly what the
# reflection-using libraries need and nothing else.

# ----- kotlinx.serialization -----
# Serializers are looked up via the synthetic `Companion.serializer()` and
# the generated `$serializer` classes.
-keepattributes *Annotation*, InnerClasses, Signature, EnclosingMethod
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class fit.aquazero.app.**$$serializer { *; }
-keepclassmembers class fit.aquazero.app.** { *** Companion; }
-keepclasseswithmembers class fit.aquazero.app.** { kotlinx.serialization.KSerializer serializer(...); }

# ----- Retrofit -----
# Retrofit reflects on method annotations and generic signatures.
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations, MethodParameters
-keepclassmembers,allowshrinking,allowobfuscation interface * { @retrofit2.http.* <methods>; }
-dontwarn retrofit2.**
-dontwarn javax.annotation.**
# R8 full mode: keep generic signatures of Call/Response used through reflection.
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation

# ----- OkHttp / Okio -----
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# ----- Room 3 -----
# Generated implementations are referenced by name from the abstract database.
-keep class * extends androidx.room3.RoomDatabase { <init>(); }
-dontwarn androidx.room3.paging.**

# ----- Coil (no reflection worth keeping beyond defaults) -----
-dontwarn coil3.**

# ----- ML Kit -----
-dontwarn com.google.mlkit.**

# ML Kit registers its components through Firebase's ComponentDiscovery, which
# reads class NAMES out of <meta-data> on ComponentDiscoveryService in the
# merged manifest and instantiates each one reflectively with a no-arg
# constructor. R8 sees no call site for those constructors and removes them,
# keeping only getComponents() — the class survives, its constructor does not,
# and every registrar fails at startup with:
#
#   ComponentDiscovery: Could not instantiate CommonComponentRegistrar
#   Caused by: java.lang.NoSuchMethodException: ...CommonComponentRegistrar.<init> []
#
# With no registered components, BarcodeScanning.getClient() throws, and the
# call in feature/nutrition/barcode/BarcodeScannerSheet.kt is inside a
# coroutine with no runCatching around it — so the barcode scanner takes the
# app down, in release builds only.
#
# `-dontwarn` above does NOT prevent this: it silences build warnings and keeps
# nothing. This is the rule that keeps something. It is deliberately written
# against the ComponentRegistrar interface rather than com.google.mlkit.** so
# that it also covers registrars from any other Firebase-components library
# added later, and so it keeps only the constructor rather than whole classes.
-keep class * implements com.google.firebase.components.ComponentRegistrar { <init>(); }

# ----- Keep BuildConfig for runtime base-url reads -----
-keep class fit.aquazero.app.BuildConfig { *; }

# ----- WebView JavaScript bridge (Cloudflare Turnstile challenge) -----
# The challenge page calls AzfCaptcha.onToken(...) / .onError(...) BY NAME.
# R8 sees no Kotlin call site for either method — the only caller is a string
# in a web page — so without this it renames or removes them and the widget
# silently never delivers a token, in release builds only. Written against the
# annotation rather than the class so it cannot drift if the bridge moves.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
