# Character Evolution

Character state is append-only. Every meaningful chapter change creates a new `character_states` row with physical, emotional, social, power and voice-relevant fields.

Voice evolution modifiers include pitch, speed, energy, breathiness, roughness, confidence and emotional control. Changes are gradual by default, temporary for injuries and permanent for transformations.

The Director consumes current states and modifiers. The renderer includes `character_state_version` and `voice_evolution_version` in the cast hash so only affected segments are invalidated.
