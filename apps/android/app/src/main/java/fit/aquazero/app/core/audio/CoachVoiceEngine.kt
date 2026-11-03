package fit.aquazero.app.core.audio

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/**
 * State of the on-device Speech-to-Text recognizer.
 */
sealed interface SpeechInputState {
    data object Idle : SpeechInputState
    data class Listening(val rmsDb: Float = 0f) : SpeechInputState
    data class Transcribing(val partialText: String) : SpeechInputState
    data class Success(val text: String) : SpeechInputState
    data class Error(val message: String) : SpeechInputState
}

/**
 * Persona voice acoustics configuration for on-device TTS.
 */
data class PersonaVoiceProfile(
    val pitch: Float = 1.0f,
    val speed: Float = 1.0f,
    val locale: Locale = Locale.US,
)

/**
 * On-device voice engine interface providing Speech-to-Text (STT) and persona-tuned Text-to-Speech (TTS).
 */
interface CoachVoiceEngine {
    val speechState: StateFlow<SpeechInputState>
    val speakingMessageId: StateFlow<String?>
    val isSpeaking: StateFlow<Boolean>

    fun startListening(onResult: (String) -> Unit, onError: (String) -> Unit)
    fun stopListening()
    fun speak(text: String, personaId: String, messageId: String? = null)
    fun stopSpeaking()
}

/**
 * On-device voice engine providing Speech-to-Text (STT) and persona-tuned Text-to-Speech (TTS).
 * Zero cloud latency, zero external API costs, private and on-device.
 */
@Singleton
class DefaultCoachVoiceEngine @Inject constructor(
    @param:ApplicationContext private val context: Context,
) : CoachVoiceEngine, TextToSpeech.OnInitListener {

    private var speechRecognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    private var isTtsInitialized = false

    private val _speechState = MutableStateFlow<SpeechInputState>(SpeechInputState.Idle)
    override val speechState: StateFlow<SpeechInputState> = _speechState.asStateFlow()

    private val _speakingMessageId = MutableStateFlow<String?>(null)
    override val speakingMessageId: StateFlow<String?> = _speakingMessageId.asStateFlow()

    private val _isSpeaking = MutableStateFlow(false)
    override val isSpeaking: StateFlow<Boolean> = _isSpeaking.asStateFlow()

    init {
        context?.let { ctx ->
            try {
                tts = TextToSpeech(ctx, this)
            } catch (_: Exception) {
                // Speech synthesis not available on some minimal emulators
            }
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.US
            tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    _isSpeaking.value = true
                    _speakingMessageId.value = utteranceId
                }

                override fun onDone(utteranceId: String?) {
                    _isSpeaking.value = false
                    _speakingMessageId.value = null
                }

                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    _isSpeaking.value = false
                    _speakingMessageId.value = null
                }
            })
            isTtsInitialized = true
        }
    }

    /**
     * Start on-device speech dictation.
     */
    override fun startListening(onResult: (String) -> Unit, onError: (String) -> Unit) {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            val err = "Speech recognition is not available on this device"
            _speechState.value = SpeechInputState.Error(err)
            onError(err)
            return
        }

        stopListening()
        stopSpeaking()

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    _speechState.value = SpeechInputState.Listening(0f)
                }

                override fun onBeginningOfSpeech() {
                    _speechState.value = SpeechInputState.Listening(0.5f)
                }

                override fun onRmsChanged(rmsdB: Float) {
                    if (_speechState.value is SpeechInputState.Listening) {
                        _speechState.value = SpeechInputState.Listening(rmsdB.coerceIn(0f, 10f))
                    }
                }

                // Raw audio frames are not used; transcription is enough.
                override fun onBufferReceived(buffer: ByteArray?) = Unit

                override fun onEndOfSpeech() {
                    _speechState.value = SpeechInputState.Transcribing("")
                }

                override fun onError(error: Int) {
                    val errorMsg = when (error) {
                        SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                        SpeechRecognizer.ERROR_CLIENT -> "Speech recognition client error"
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission required"
                        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
                        SpeechRecognizer.ERROR_NO_MATCH -> "No speech detected"
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Speech recognizer busy"
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech input"
                        else -> "Speech recognition error ($error)"
                    }
                    _speechState.value = SpeechInputState.Error(errorMsg)
                    onError(errorMsg)
                }

                override fun onResults(results: Bundle?) {
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val text = matches?.firstOrNull()?.trim().orEmpty()
                    if (text.isNotEmpty()) {
                        _speechState.value = SpeechInputState.Success(text)
                        onResult(text)
                    } else {
                        _speechState.value = SpeechInputState.Idle
                    }
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val text = matches?.firstOrNull().orEmpty()
                    if (text.isNotEmpty()) {
                        _speechState.value = SpeechInputState.Transcribing(text)
                    }
                }

                // Reserved by the platform; no documented events to handle.
                override fun onEvent(eventType: Int, params: Bundle?) = Unit
            })
        }

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }

        try {
            speechRecognizer?.startListening(intent)
        } catch (e: SecurityException) {
            // RECORD_AUDIO revoked between the permission check and this call.
            reportListenFailure(e, "Microphone permission required", onError)
        } catch (e: IllegalStateException) {
            // Recognizer destroyed or already listening.
            reportListenFailure(e, "Speech recognizer unavailable", onError)
        }
    }

    /** Surface a start-up failure to both the state flow and the caller. */
    private fun reportListenFailure(
        cause: Throwable,
        fallback: String,
        onError: (String) -> Unit,
    ) {
        val message = cause.message ?: fallback
        _speechState.value = SpeechInputState.Error(message)
        onError(message)
    }

    /**
     * Stop listening and destroy active recognizer instance.
     */
    override fun stopListening() {
        try {
            speechRecognizer?.stopListening()
            speechRecognizer?.destroy()
        } catch (_: IllegalStateException) {
            // Already destroyed, or never started — nothing to release.
        }
        speechRecognizer = null
        if (_speechState.value !is SpeechInputState.Success) {
            _speechState.value = SpeechInputState.Idle
        }
    }

    /**
     * Speak text using persona voice parameters.
     */
    override fun speak(text: String, personaId: String, messageId: String?) {
        if (!isTtsInitialized || tts == null) return

        val profile = getVoiceProfile(personaId)
        tts?.setPitch(profile.pitch)
        tts?.setSpeechRate(profile.speed)

        val cleanText = text
            .replace(Regex("\\*\\*([^*]+)\\*\\*"), "$1") // strip bold
            .replace(Regex("`([^`]+)`"), "$1") // strip inline code
            .replace(Regex("#+\\s*"), "") // strip headings
            .replace(Regex("\\[[^\\]]+\\]"), "") // strip action tags
            .trim()

        val utteranceId = messageId ?: System.currentTimeMillis().toString()
        _isSpeaking.value = true
        _speakingMessageId.value = utteranceId

        tts?.speak(cleanText, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
    }

    /**
     * Stop currently active speech synthesis.
     */
    override fun stopSpeaking() {
        if (isTtsInitialized) {
            tts?.stop()
            _isSpeaking.value = false
            _speakingMessageId.value = null
        }
    }

    /**
     * Map coach persona ID to distinct speech acoustics.
     */
    private fun getVoiceProfile(personaId: String): PersonaVoiceProfile = when (personaId) {
        "anderson" -> PersonaVoiceProfile(pitch = 0.85f, speed = 0.95f) // Deep, steady
        "craig" -> PersonaVoiceProfile(pitch = 0.80f, speed = 0.90f) // Deep, gritty
        "frank" -> PersonaVoiceProfile(pitch = 0.82f, speed = 0.92f) // Heavy stoic
        "dmitry" -> PersonaVoiceProfile(pitch = 0.88f, speed = 0.90f) // Heavy cold
        "uthman" -> PersonaVoiceProfile(pitch = 0.90f, speed = 0.98f) // Direct, concise
        "carlos" -> PersonaVoiceProfile(pitch = 1.15f, speed = 1.10f) // Energetic, fast
        "fabio" -> PersonaVoiceProfile(pitch = 1.08f, speed = 1.02f) // Dynamic
        "kwon" -> PersonaVoiceProfile(pitch = 1.12f, speed = 1.12f) // Fast, sharp
        "randall" -> PersonaVoiceProfile(pitch = 1.10f, speed = 1.08f) // Dynamic, brisk
        "sanzo" -> PersonaVoiceProfile(pitch = 1.00f, speed = 0.95f) // Joyful, measured
        "kazushi" -> PersonaVoiceProfile(pitch = 0.92f, speed = 0.94f) // Wise, measured
        "george" -> PersonaVoiceProfile(pitch = 0.95f, speed = 0.96f) // Methodical
        "ogun" -> PersonaVoiceProfile(pitch = 0.78f, speed = 0.90f) // Sovereign, deep
        else -> PersonaVoiceProfile(pitch = 1.02f, speed = 1.00f) // Akin / default
    }
}

/**
 * Hilt binding module for [CoachVoiceEngine].
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class CoachVoiceEngineModule {
    @Binds
    @Singleton
    abstract fun bindVoiceEngine(impl: DefaultCoachVoiceEngine): CoachVoiceEngine
}

/**
 * Fake implementation for testing and preview environments.
 */
class FakeCoachVoiceEngine : CoachVoiceEngine {
    private val _speechState = MutableStateFlow<SpeechInputState>(SpeechInputState.Idle)
    override val speechState: StateFlow<SpeechInputState> = _speechState.asStateFlow()

    private val _speakingMessageId = MutableStateFlow<String?>(null)
    override val speakingMessageId: StateFlow<String?> = _speakingMessageId.asStateFlow()

    private val _isSpeaking = MutableStateFlow(false)
    override val isSpeaking: StateFlow<Boolean> = _isSpeaking.asStateFlow()

    override fun startListening(onResult: (String) -> Unit, onError: (String) -> Unit) = Unit

    override fun stopListening() = Unit

    override fun speak(text: String, personaId: String, messageId: String?) = Unit

    override fun stopSpeaking() = Unit
}
