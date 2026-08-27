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

# ----- Keep BuildConfig for runtime base-url reads -----
-keep class fit.aquazero.app.BuildConfig { *; }
