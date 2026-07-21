# Voice Variations

Voice variation profiles store a stable base provider, model, voice, transformation parameters, language capabilities, and version. Characters keep the same base voice, profile id, and version across chapters unless an administrator changes the assignment or Character Evolution records a justified gradual/permanent change.

Temporary states such as wounded, exhausted, frightened, angry, whispering, crying, possessed, underwater, masked, and distant layer on top of the permanent profile and do not overwrite it.

Cache identity includes base provider, model, voice, profile id, profile version, temporary state, and transformation engine version so changing one character invalidates only affected segments.
