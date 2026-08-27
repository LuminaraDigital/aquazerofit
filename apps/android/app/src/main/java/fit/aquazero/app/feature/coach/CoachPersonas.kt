package fit.aquazero.app.feature.coach

import androidx.annotation.StringRes
import androidx.compose.ui.graphics.Color
import fit.aquazero.app.R

/**
 * Client mirror of `packages/shared/src/coaches.ts` — the presentation half.
 *
 * Only the parts a screen needs to *draw* a coach live here: identity, theme
 * colour, art convention and the level door. Two things deliberately do NOT:
 *
 *  - **Voice blocks.** They are prompt material, they never reach a client.
 *  - **Reaction lines.** They are authored strings the server renders and
 *    sends back on `GET /coaches/progression`. Mirroring them here would give
 *    the app a second copy that can drift from the one the safety review
 *    signed off on, and would tempt a future change to generate one instead.
 *    The celebration surface renders what the server hands it, or nothing.
 *
 * Names and ring names are proper nouns and stay in code; every line of prose
 * is a string resource.
 *
 * `stars` is absent by design: Telegram Stars is stripped for Play. The level
 * is the only door, which is also the door that was always open to everyone.
 */
data class CoachPersona(
    val id: String,
    /** Proper noun — not localised. */
    val name: String,
    /** Ring name / fight-card alias — not localised. */
    val ringName: String,
    @param:StringRes val taglineRes: Int,
    @param:StringRes val disciplineRes: Int,
    @param:StringRes val domainRes: Int,
    @param:StringRes val voiceWordRes: Int,
    /** Card + chat accent colour, ported from the roster's `colour`. */
    val colour: Color,
    /** Level at which this coach opens through use alone; 0 when free. */
    val unlockLevel: Int,
) {
    /** What the chat header, composer and live region call this coach. */
    val firstName: String get() = name.substringBefore(' ')

    /** Monogram shown when neither portrait nor avatar art is bundled. */
    val monogram: String get() = name.take(1).uppercase()

    val isFree: Boolean get() = unlockLevel <= 0
}

/**
 * The roster, in `COACHES` order — which is unlock order, not alphabetical.
 * Character select renders it exactly like this so the ladder reads top to
 * bottom.
 */
object CoachRoster {

    val personas: List<CoachPersona> = listOf(
        CoachPersona(
            id = "akin",
            name = "Akin Celsus",
            ringName = "Divinus",
            taglineRes = R.string.coach_akin_tagline,
            disciplineRes = R.string.coach_akin_discipline,
            domainRes = R.string.coach_akin_domain,
            voiceWordRes = R.string.coach_akin_voice,
            colour = Color(0xFF22D3EE),
            unlockLevel = 0,
        ),
        CoachPersona(
            id = "sanzo",
            name = "Sanzō",
            ringName = "Sumo",
            taglineRes = R.string.coach_sanzo_tagline,
            disciplineRes = R.string.coach_sanzo_discipline,
            domainRes = R.string.coach_sanzo_domain,
            voiceWordRes = R.string.coach_sanzo_voice,
            colour = Color(0xFFF43F5E),
            unlockLevel = 0,
        ),
        CoachPersona(
            id = "anderson",
            name = "Anderson Couture",
            ringName = "The Giant",
            taglineRes = R.string.coach_anderson_tagline,
            disciplineRes = R.string.coach_anderson_discipline,
            domainRes = R.string.coach_anderson_domain,
            voiceWordRes = R.string.coach_anderson_voice,
            colour = Color(0xFF94A3B8),
            unlockLevel = 3,
        ),
        CoachPersona(
            id = "king",
            name = "King Yamsiri",
            ringName = "King",
            taglineRes = R.string.coach_king_tagline,
            disciplineRes = R.string.coach_king_discipline,
            domainRes = R.string.coach_king_domain,
            voiceWordRes = R.string.coach_king_voice,
            colour = Color(0xFF3B82F6),
            unlockLevel = 5,
        ),
        CoachPersona(
            id = "jacare",
            name = "Jacaré Aldo",
            ringName = "The Prince",
            taglineRes = R.string.coach_jacare_tagline,
            disciplineRes = R.string.coach_jacare_discipline,
            domainRes = R.string.coach_jacare_domain,
            voiceWordRes = R.string.coach_jacare_voice,
            colour = Color(0xFFEAB308),
            unlockLevel = 7,
        ),
        CoachPersona(
            id = "kazushi",
            name = "Kazushi Horiuchi",
            ringName = "The Hunter",
            taglineRes = R.string.coach_kazushi_tagline,
            disciplineRes = R.string.coach_kazushi_discipline,
            domainRes = R.string.coach_kazushi_domain,
            voiceWordRes = R.string.coach_kazushi_voice,
            colour = Color(0xFF64748B),
            unlockLevel = 9,
        ),
        CoachPersona(
            id = "mataemon",
            name = "Mataemon Aoki",
            ringName = "Tobikan",
            taglineRes = R.string.coach_mataemon_tagline,
            disciplineRes = R.string.coach_mataemon_discipline,
            domainRes = R.string.coach_mataemon_domain,
            voiceWordRes = R.string.coach_mataemon_voice,
            colour = Color(0xFF6366F1),
            unlockLevel = 11,
        ),
        CoachPersona(
            id = "uthman",
            name = "Uthman Nurmakhmedov",
            ringName = "The Crusher",
            taglineRes = R.string.coach_uthman_tagline,
            disciplineRes = R.string.coach_uthman_discipline,
            domainRes = R.string.coach_uthman_domain,
            voiceWordRes = R.string.coach_uthman_voice,
            colour = Color(0xFF0EA5E9),
            unlockLevel = 14,
        ),
        CoachPersona(
            id = "ogun",
            name = "Ogun Celsus",
            ringName = "The Daemon King",
            taglineRes = R.string.coach_ogun_tagline,
            disciplineRes = R.string.coach_ogun_discipline,
            domainRes = R.string.coach_ogun_domain,
            voiceWordRes = R.string.coach_ogun_voice,
            colour = Color(0xFFDC2626),
            unlockLevel = 18,
        ),
    )

    /** `DEFAULT_COACH_ID` — guaranteed present, every read path can rely on it. */
    const val DEFAULT_ID: String = "akin"

    fun byId(id: String?): CoachPersona? = personas.firstOrNull { it.id == id }

    /** The default persona; used until the roster resolves. */
    fun default(): CoachPersona = byId(DEFAULT_ID) ?: personas.first()

    /** The persona to draw for [id], never null. */
    fun resolve(id: String?): CoachPersona = byId(id) ?: default()
}
