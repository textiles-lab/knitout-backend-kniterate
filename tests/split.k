;!knitout-2
;;Carriers: 1 2 3 4 5 6
;;Machine: Kniterate
in 1

knit + f1 1
knit + f2 1
knit + f3 1
knit + f4 1
knit + f5 1
knit + f6 1
knit - f6 1
knit - f5 1
knit - f4 1
knit - f3 1
split - f2 b2 1
knit - f1 1

knit + f1 1
split + b2 f2 1
split + f3 b3 1
knit + f4 1
knit + f5 1
knit + f6 1

rack -1
split - f6 b7 1
rack 0
split - f5 b5 1
out 1