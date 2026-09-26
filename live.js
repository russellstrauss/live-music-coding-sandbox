setcpm(140/4);


$: n("<0 3 0 5 7>*16".add("<6 _ _ 3 2 5 _ _ 9>*2")).scale("g:major").trans(0)
.o(3).s("sawtooth").distort(2).acidenv(slider(1))
._pianoroll()

$: n("<0 3 0 5 7>*16".add("<6 _ _ 3 2 5 _ _ 9>*2")).scale("g:major").trans(-24)
.o(3).s("supersaw").distort(3).acidenv(slider(0.912))
._pianoroll()

$: s("bd:2!4:sd")
.duck("3:4:5:6")
.duckdepth(.8)
.duckattack(.16)
._scope()
