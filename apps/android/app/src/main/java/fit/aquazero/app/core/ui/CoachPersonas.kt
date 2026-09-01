package fit.aquazero.app.core.ui

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
 *
 * Below the features rather than inside the coach one: a coach's face and
 * colour turn up wherever the app speaks in that coach's voice — the chat, the
 * character select, and the celebration surfaces that congratulate a person in
 * it. Owned by `:feature:coach`, every one of those callers would have to
 * reach across into another feature to draw a persona.
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
            id = "carlos",
            name = "Carlos Mendez",
            ringName = "El Huracán",
            taglineRes = R.string.coach_carlos_tagline,
            disciplineRes = R.string.coach_carlos_discipline,
            domainRes = R.string.coach_carlos_domain,
            voiceWordRes = R.string.coach_carlos_voice,
            colour = Color(0xFFEAB308),
            unlockLevel = 4,
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
            id = "craig",
            name = "Craig Beast",
            ringName = "The Juggernaut",
            taglineRes = R.string.coach_craig_tagline,
            disciplineRes = R.string.coach_craig_discipline,
            domainRes = R.string.coach_craig_domain,
            voiceWordRes = R.string.coach_craig_voice,
            colour = Color(0xFFB91C1C),
            unlockLevel = 6,
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
            id = "danial",
            name = "Danial Nickal",
            ringName = "The Wolf",
            taglineRes = R.string.coach_danial_tagline,
            disciplineRes = R.string.coach_danial_discipline,
            domainRes = R.string.coach_danial_domain,
            voiceWordRes = R.string.coach_danial_voice,
            colour = Color(0xFF0284C7),
            unlockLevel = 8,
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
            id = "dmitry",
            name = "Dmitry Volkov",
            ringName = "The Iron Bear",
            taglineRes = R.string.coach_dmitry_tagline,
            disciplineRes = R.string.coach_dmitry_discipline,
            domainRes = R.string.coach_dmitry_domain,
            voiceWordRes = R.string.coach_dmitry_voice,
            colour = Color(0xFF475569),
            unlockLevel = 10,
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
            id = "fabio",
            name = "Fabio Guedes",
            ringName = "O Mestre",
            taglineRes = R.string.coach_fabio_tagline,
            disciplineRes = R.string.coach_fabio_discipline,
            domainRes = R.string.coach_fabio_domain,
            voiceWordRes = R.string.coach_fabio_voice,
            colour = Color(0xFF10B981),
            unlockLevel = 12,
        ),
        CoachPersona(
            id = "frank",
            name = "Frank Mason",
            ringName = "The Anvil",
            taglineRes = R.string.coach_frank_tagline,
            disciplineRes = R.string.coach_frank_discipline,
            domainRes = R.string.coach_frank_domain,
            voiceWordRes = R.string.coach_frank_voice,
            colour = Color(0xFF78716C),
            unlockLevel = 13,
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
            id = "gaius",
            name = "Gaius Marcus",
            ringName = "The Centurion",
            taglineRes = R.string.coach_gaius_tagline,
            disciplineRes = R.string.coach_gaius_discipline,
            domainRes = R.string.coach_gaius_domain,
            voiceWordRes = R.string.coach_gaius_voice,
            colour = Color(0xFFB45309),
            unlockLevel = 15,
        ),
        CoachPersona(
            id = "george",
            name = "George Saint",
            ringName = "The Architect",
            taglineRes = R.string.coach_george_tagline,
            disciplineRes = R.string.coach_george_discipline,
            domainRes = R.string.coach_george_domain,
            voiceWordRes = R.string.coach_george_voice,
            colour = Color(0xFF059669),
            unlockLevel = 16,
        ),
        CoachPersona(
            id = "kwon",
            name = "Kwon Won-Ri",
            ringName = "The Flash",
            taglineRes = R.string.coach_kwon_tagline,
            disciplineRes = R.string.coach_kwon_discipline,
            domainRes = R.string.coach_kwon_domain,
            voiceWordRes = R.string.coach_kwon_voice,
            colour = Color(0xFF06B6D4),
            unlockLevel = 17,
        ),
        CoachPersona(
            id = "mike",
            name = "Mike Takayama",
            ringName = "The Ronin",
            taglineRes = R.string.coach_mike_tagline,
            disciplineRes = R.string.coach_mike_discipline,
            domainRes = R.string.coach_mike_domain,
            voiceWordRes = R.string.coach_mike_voice,
            colour = Color(0xFFD97706),
            unlockLevel = 19,
        ),
        CoachPersona(
            id = "paul",
            name = "Paul Thomas",
            ringName = "The Anchor",
            taglineRes = R.string.coach_paul_tagline,
            disciplineRes = R.string.coach_paul_discipline,
            domainRes = R.string.coach_paul_domain,
            voiceWordRes = R.string.coach_paul_voice,
            colour = Color(0xFF4338CA),
            unlockLevel = 20,
        ),
        CoachPersona(
            id = "randall",
            name = "Randall Stevens",
            ringName = "The Maverick",
            taglineRes = R.string.coach_randall_tagline,
            disciplineRes = R.string.coach_randall_discipline,
            domainRes = R.string.coach_randall_domain,
            voiceWordRes = R.string.coach_randall_voice,
            colour = Color(0xFFF59E0B),
            unlockLevel = 21,
        ),
        CoachPersona(
            id = "reinier",
            name = "Reinier Jansen",
            ringName = "The Flying Dutchman",
            taglineRes = R.string.coach_reinier_tagline,
            disciplineRes = R.string.coach_reinier_discipline,
            domainRes = R.string.coach_reinier_domain,
            voiceWordRes = R.string.coach_reinier_voice,
            colour = Color(0xFFEA580C),
            unlockLevel = 22,
        ),
        CoachPersona(
            id = "rolando",
            name = "Rolando Fitch",
            ringName = "El Fuego",
            taglineRes = R.string.coach_rolando_tagline,
            disciplineRes = R.string.coach_rolando_discipline,
            domainRes = R.string.coach_rolando_domain,
            voiceWordRes = R.string.coach_rolando_voice,
            colour = Color(0xFFEF4444),
            unlockLevel = 23,
        ),
        CoachPersona(
            id = "ryoto",
            name = "Ryōto Katou",
            ringName = "The Dragon",
            taglineRes = R.string.coach_ryoto_tagline,
            disciplineRes = R.string.coach_ryoto_discipline,
            domainRes = R.string.coach_ryoto_domain,
            voiceWordRes = R.string.coach_ryoto_voice,
            colour = Color(0xFFDC2626),
            unlockLevel = 24,
        ),
        CoachPersona(
            id = "sergio",
            name = "Sergio Newton",
            ringName = "The Specialist",
            taglineRes = R.string.coach_sergio_tagline,
            disciplineRes = R.string.coach_sergio_discipline,
            domainRes = R.string.coach_sergio_domain,
            voiceWordRes = R.string.coach_sergio_voice,
            colour = Color(0xFF8B5CF6),
            unlockLevel = 25,
        ),
        CoachPersona(
            id = "terry",
            name = "Terry Crawford",
            ringName = "The Outlaw",
            taglineRes = R.string.coach_terry_tagline,
            disciplineRes = R.string.coach_terry_discipline,
            domainRes = R.string.coach_terry_domain,
            voiceWordRes = R.string.coach_terry_voice,
            colour = Color(0xFFCA8A04),
            unlockLevel = 26,
        ),
        CoachPersona(
            id = "usman",
            name = "Usman Sergei Magomedov",
            ringName = "The Eagle",
            taglineRes = R.string.coach_usman_tagline,
            disciplineRes = R.string.coach_usman_discipline,
            domainRes = R.string.coach_usman_domain,
            voiceWordRes = R.string.coach_usman_voice,
            colour = Color(0xFF047857),
            unlockLevel = 27,
        ),
        CoachPersona(
            id = "zhang",
            name = "Zhang Kai",
            ringName = "The Shadow",
            taglineRes = R.string.coach_zhang_tagline,
            disciplineRes = R.string.coach_zhang_discipline,
            domainRes = R.string.coach_zhang_domain,
            voiceWordRes = R.string.coach_zhang_voice,
            colour = Color(0xFFB91C1C),
            unlockLevel = 28,
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
            unlockLevel = 30,
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
