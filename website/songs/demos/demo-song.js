export const id = "m4Q8nR2kP7wL";
export const title = "Demo Song";
export const code = "\nsetcpm(30)\n\n$: s(\"bd*4\").gain(1)\n\n$: s(\"~ cp ~ cp\")\n  .gain(0.7)\n\n$: s(\"hh*8\")\n  .gain(\"[0.25 0.6]*4\")\n\n$: note(\"a1 ~ a1 c2 ~ e2 ~ c2\")\n  .sound(\"sawtooth\")\n  .lpf(600)\n  .decay(0.15)\n  .sustain(0.2)\n  .gain(0.6)\n\n$: note(\"<[a3,c4,e4] [g3,b3,e4] [f3,a3,c4] [g3,b3,d4]>\")\n  .sound(\"triangle\")\n  .lpf(1800)\n  .attack(0.02)\n  .release(0.3)\n  .room(0.3)\n  .gain(0.3)";
