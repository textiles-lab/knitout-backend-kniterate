;!knitout-2
;;Machine: Kniterate
;;Gauge: 7
;;Carriers: 1 2 3 4 5 6
;;Position: Keep

; ^ In the header section above, each line is preceded by two semicolins (except for the knitout version, which uses ';!')--not to be confused with comments, which are preceded by a single semi-colin.
, The header section contains some required and some optional info. as follows:
; 1: the version of knitout being used [required] - (current version is knitout-2)
; 2: the machine [optional] - (which will always be 'Kniterate', if this backend is in use.)
; 3: the gauge of the machine [optional] - (once again, always 7 for kniterate.)
; 4: numbered list of carriers [required] - (not just the carriers used in the file, but rather ALL of the carriers the machine has available. For kniterate, this is always '1 2 3 4 5 6')
; 5: the position to place the knit on the needle bed [optional] - ('Keep' means that each knitout needle number parameter is translated literally to the needle number on the bed (i.e. f1 means needle #1 on the front bed), whereas indicating 'Left', 'Right', or 'Center' shifts the needle numbers accordingly. If no position is specified, it is assumed that the piece is meant to be centered on the bed).

x-stitch-number 5
; ^ Above is an example of an extention header, which are all preceded by 'x-'.
; this particular extention dictates the size of knit stitches (with 0 being the smallest, and 9 the largest). It can be redefined anywhere in the file, and applies to the operations that follow it.

x-roller-advance 100
; ^ This is another extention, which dictates the roller travel distance that will take place after each pass. Like stitch number, it can also be redefined anywhere in the file.
; the roller serves to tug the piece down as more rows pile up (if you are familiar with knitting on a hand-operated machine, it is similar to hanging weights).

in 1
; ^ Each carrier must be brought into work before it is used, as seen above. Essentially, this just tells the machine to pick up that carrier.
; if we don't include this operation, the backend will throw an error.

x-add-roller-advance 50
; ^ If we want to alter the roller advance for just one pass, we can alternatively use the extention 'x-add-roller-advance'. So, since the global 'x-roller-advance' value was set to 100, the following pass with have a roller advance of 150 (and would reset to 100 for the rest of the passes, until we write another roller advance extention). This value can also be negative (x-add-roller-advance -50 ==> 100 + (-50) , so roller advance = 50. Or even x-add-roller-advance -150 => 100 + (-150) , so roller advnace = -50

; v The passes below serve to secure the yarns that will be used in the piece. On the kniterate machine, if the yarn held by a carrier is not already attached to the piece, the needles likely won't be able to grab a hold of it, resulting in dropped stitches. (more 'yarn in' passes = more likely that the yarn will be properly secured).
knit + f1 1 ; < This is the first knit operation, which takes the following parameters (variables are wrapped in {}): knit {direction} {bed}{needle} {carrier}.
knit + b2 1 ; < The next operation tells the machine to continue knitting in the positive ('+') direction on the consecutive needle, but this time on the back bed ('b' versus 'f')
knit + f3 1 ; < Note that we are alternating between knitting odd needles on the front bed and even on the back, rather than knitting all needles on both beds. This is because, by default, the machine is at rack 0, meaning that front and back bed needles of the same number are across from each other--so knitting both 'f1' and 'b1' at the same time would cause the needles to collide. (Luckily, if we were to input a file with this issue into the backend, it would throw an error to prevent a problematic situation.) 
knit + b4 1
knit + f5 1
knit + b6 1
knit + f7 1
knit + b8 1
knit + f9 1
knit + b10 1
knit - f10 1 ; < Here, this direction switches to negative, and the knit operations begin to refer to needles in descending order. The backend interprets a change in direction or carrier as a new pass (thinking back to x-add-roller-advance... roller advance is now reset to 100)
knit - b9 1
knit - f8 1
knit - b7 1
knit - f6 1
knit - b5 1
knit - f4 1
knit - b3 1
knit - f2 1
knit - b1 1

in 2
; ^ Just as for carrier 1, carrier 2 must be brought in before we knit with it.

knit + f1 2 ; < The last parameter (carrier) is now 2. 
knit + b2 2
knit + f3 2
knit + b4 2
knit + f5 2
knit + b6 2
knit + f7 2
knit + b8 2
knit + f9 2
knit + b10 2
knit - f10 2
knit - b9 2
knit - f8 2
knit - b7 2
knit - f6 2
knit - b5 2
knit - f4 2
knit - b3 2
knit - f2 2
knit - b1 2

; v Below is the beginning of a waste yarn section, which is necessary on the kniterate machine so that the rollers have something to grab onto before the main section (some other automated knitting machines don't need this, since they have sinker plates to hold the knit down)
; unlike the section above, the passes alternate between 1) knitting even needles on the front and odd on the back, and 2) knitting odd on the front and even on the back.
; if you are wondering 'why not just knit all needles on the front bed in one direction and all needles on the back in the opposite direction?'--this is because the initial knit stitches cannot form if the yarn is just placed flat on all needles in a row--we need to cast it on in a sort of zigzag fashion to form the beginning loops. We repeat this over and over again to ensure all needles have formed knit stitches (since the rollers are not yet engaged, we need the extra security.) 
; for the sake of brevity, we've included only two passes of the waste yarn section, but normally, it would contain around 70 passes.
knit + f1 1
knit + b2 1
knit + f3 1
knit + b4 1
knit + f5 1
knit + b6 1
knit + f7 1
knit + b8 1
knit + f9 1
knit + b10 1
knit + f11 1
knit + b12 1
knit + f13 1
knit + b14 1
knit + f15 1
knit + b16 1
knit + f17 1
knit + b18 1
knit + f19 1
knit + b20 1
knit - f20 1
knit - b19 1
knit - f18 1
knit - b17 1
knit - f16 1
knit - b15 1
knit - f14 1
knit - b13 1
knit - f12 1
knit - b11 1
knit - f10 1
knit - b9 1
knit - f8 1
knit - b7 1
knit - f6 1
knit - b5 1
knit - f4 1
knit - b3 1
knit - f2 1
knit - b1 1

; v After the waste yarn section is finished, we drop all the needles on the back bed so that we can knit a draw thread on the front bed (coming up next) to detach the waste yarn section from the main piece.
drop b1 ; < Unlike the 'knit' operation, 'drop' takes only two parameters: the bed ('f' or 'b'), and the needle number.
drop b2
drop b3
drop b4
drop b5
drop b6
drop b7
drop b8
drop b9
drop b10

; v Next is the draw thread, which can be pulled out to drop the waste yarn from the main section once the piece is finished.
knit + f1 3
knit + f2 3
knit + f3 3
knit + f4 3
knit + f5 3
knit + f6 3
knit + f7 3
knit + f8 3
knit + f9 3
knit + f10 3

rack 0.5 ; < Here we have the 'rack' operation, which can take any value between -4 and 4 (in increments of 0.5)
; you might notice that some knitout contains rack values in increments of 0.25, which is because Shima Seiki machines interpret half rack (0.5) as (0.25). Don't worry about this--if a quarter rack is specified, the knitout-kniterate backend will convert it to half rack.

; v Below is the cast on--a clean edge at the beginning of the piece that will emerge when the draw thread is pulled.
; note that we can now knit the same needle number on both beds in one pass, since the rack value is 0.5. (when the machine is at half rack [or 1.5, 2.5, etc.], the back bed is shifted [aka 'racked'] so that its needles are positioned in-between the front bed needles).
knit + f1 1
knit + b1 1
knit + f2 1
knit + b2 1
knit + f3 1
knit + b3 1
knit + f4 1
knit + b4 1
knit + f5 1
knit + b5 1
knit + f6 1
knit + b6 1
knit + f7 1
knit + b7 1
knit + f8 1
knit + b8 1
knit + f9 1
knit + b9 1
knit + f10 1
knit + b10 1

rack 0 ; < Reset the rack value to 0.

; v At this point, we just go ahead and knit some rows. Not all needles need to be knit in one pass (which is typical in colorwork and some stitch patterns), but if a yarn goes without knitting for more than 5 or so needles, we face the risk of dropping stitches (similar to the reason we have those initial 'yarn in' passes at the beginning of the piece).
knit - f10 1
knit - f9 1
knit - f8 1
knit - b6 1
knit - b3 1
miss - f1 1 ; < The 'miss' operation takes the same parameters as knit (direction, bed, needle number, and carrier), but it performs a different function. 'Miss' instructs the carriage to move the working carrier past the respective needle, without selecting it.
knit + b1 2
knit + f4 2
knit + f5 2
knit + b7 2
knit + b9 2
knit + b10 2

; it was a short piece, but for demonstration purposes, we'll stop there and take the carriers out of work:

out 1
out 2
; ^ The 'out' operation instructs the carriage to pick up a carrier and park it on the left side, past the needle bed (out of the way).
; since carrier 1 ended in the negative direction (going right to left), so it avoids the working needles when it is brought out.
; on the other hand, carrier 2 ended in the positive direction, meaning that bringing it out will pass an unsecured strand of yarn over the working needles. This won't necessarily cause dropped stitches (since no needles are being selected), but if we were to continue knitting, the next pass would knit this unsecured strand along with the yarn from the working carrier, which we might not want. To avoid this, we might add a 'miss' operation for a few needles past the right-most working needle after the last pass for carriers that end in the positive direction. Accordingly, the carrier is out of the way, and we can bring it out at the very end of the piece.
