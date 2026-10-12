export const id = "zC3zoXNk3Bmp";
export const title = "Basic Beat";
export const code = "setcpm(150)\n\nsamples('github:algorave-dave/samples')\nsamples('github:tidalcyles/dirt-samples')\n\n// $: s(\"bd*4\")._punchcard()\n// $: s(\"~ cp ~ cp\")._punchcard()\n// $: s(\"hh*8\")._punchcard()\n// $: s(\"hh*16\").gain(0.5)._punchcard()\n\n$: s(\"cp:0\")\n.note(\"g#1\")\n.slice(8, \"<5 6>\".fast(2))\n.chop(32).cut(1).loopAt(4)\n.room(2)\n.gain(\"<0.6 1.6>\".slow(2))\n.lpf(slider(4000, 600, 4000))\n.scope()";
