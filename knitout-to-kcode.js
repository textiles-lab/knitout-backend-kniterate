#!/bin/sh
':' //; exec "$(command -v nodejs || command -v node)" "$0" "$@"
"use strict";

//------------------------------------


//BedNeedle helps store needles:

function BedNeedle(bed, needle) {
	if (arguments.length == 1 && typeof(arguments[0]) === 'string') {
		let str = arguments[0];
		let m = str.match(/^([fb]s?)(-?\d+)$/);
		if (!m) {
			throw "ERROR: invalid needle specification '" + str + "'.";
		}
		this.bed = m[1];
		this.needle = parseInt(m[2]);
	} else if (arguments.length == 2 && typeof(arguments[0]) === 'string' && typeof(arguments[1]) === 'number') {
		this.bed = arguments[0];
		this.needle = arguments[1];
	} else {
		throw "Don't know how to construct a BedNeedle from the given arguments";
	}
}

BedNeedle.prototype.toString = function() {
	return this.bed + this.needle;
};

BedNeedle.prototype.isFront = function(){
	if (this.bed === 'f' || this.bed === 'fs') return true;
	else if (this.bed === 'b' || this.bed === 'bs') return false;
	else throw "Invalid bed in BedNeedle.";
};

BedNeedle.prototype.isBack = function(){
	if (this.bed === 'f' || this.bed === 'fs') return false;
	else if (this.bed === 'b' || this.bed === 'bs') return true;
	else throw "Invalid bed in BedNeedle.";
};

//Carrier objects store information about each carrier:
function Carrier(name) {
	this.name = name;
	this.last = null; //last stitch -- {needle:, direction:} -- or null if not yet brought in
	this.kick = null; //last kick -- {needle:, direction:}
	this.in = null; //the "in" operation that added this to the active set. (format: {op:"in", cs:["", "", ...]})
}

//parking locations for each carrier:
//TODO: consider changing this
const CARRIER_PARKING = [
	-11.5,
	-9.5,
	-9.5,
	-7.5,
	-7.5,
	-7.5,
];

//special op, merges with knit/tuck/etc:
const OP_SOFT_MISS = { name:'OP_SOFT_MISS' };

const OP_TUCK_FRONT = { name:'OP_TUCK_FRONT', isFront:true };
const OP_TUCK_BACK  = { name:'OP_TUCK_BACK',  isBack:true };

const OP_KNIT_FRONT = { name:'OP_KNIT_FRONT', isFront:true };
const OP_KNIT_BACK  = { name:'OP_KNIT_BACK', isBack:true };

//combo ops:
const OP_KNIT_FRONT_KNIT_BACK = { name:'OP_KNIT_FRONT_KNIT_BACK', isFront:true, isBack:true };
const OP_KNIT_FRONT_TUCK_BACK = { name:'OP_KNIT_FRONT_TUCK_BACK', isFront:true, isBack:true };
const OP_KNIT_FRONT_MISS_BACK = { name:'OP_KNIT_FRONT_MISS_BACK', isFront:true };
const OP_TUCK_FRONT_KNIT_BACK = { name:'OP_TUCK_FRONT_KNIT_BACK', isFront:true, isBack:true };
const OP_TUCK_FRONT_TUCK_BACK = { name:'OP_TUCK_FRONT_TUCK_BACK', isFront:true, isBack:true };
const OP_TUCK_FRONT_MISS_BACK = { name:'OP_TUCK_FRONT_MISS_BACK', isFront:true };
const OP_MISS_FRONT_KNIT_BACK = { name:'OP_MISS_FRONT_KNIT_BACK', isBack:true };
const OP_MISS_FRONT_TUCK_BACK = { name:'OP_MISS_FRONT_TUCK_BACK', isBack:true };
const OP_MISS_FRONT_MISS_BACK = { name:'OP_MISS_FRONT_MISS_BACK' };

const OP_XFER_TO_BACK  = { name:'OP_XFER_TO_BACK', isFront:true };
const OP_XFER_TO_FRONT = { name:'OP_XFER_TO_FRONT', isBack:true };

const OP_SPLIT = { name:'OP_SPLIT', isFront:true, isBack:true }; //the type of OP_SPLIT is determined by the type of the pass that contains it.

//return a combined operation that does 'a' then 'b' (moving right), or null if such a thing doesn't exist
function merge_ops(a,b,quarterPitch) {
	//soft miss will always be replaced by another operation in the same slot:
	if (a === OP_SOFT_MISS) {
		return b;
	} else if (b === OP_SOFT_MISS) {
		return a;
	}
	//see if a/b fit one of the combo ops:
	if (!quarterPitch) return null; //can't merge front/back ops without quarter pitch racking
	//operations are always front-then-back 
	if (a === OP_MISS_FRONT_MISS_BACK) {
		if      (b === OP_MISS_FRONT_MISS_BACK) return OP_MISS_FRONT_MISS_BACK;
		else if (b === OP_MISS_FRONT_TUCK_BACK || b === OP_TUCK_BACK) return OP_MISS_FRONT_TUCK_BACK;
		else if (b === OP_MISS_FRONT_KNIT_BACK || b === OP_KNIT_BACK) return OP_MISS_FRONT_KNIT_BACK;
	} else if (a === OP_TUCK_FRONT_MISS_BACK || a === OP_TUCK_FRONT) {
		if      (b === OP_MISS_FRONT_MISS_BACK) return OP_TUCK_FRONT_MISS_BACK;
		else if (b === OP_MISS_FRONT_TUCK_BACK || b === OP_TUCK_BACK) return OP_TUCK_FRONT_TUCK_BACK;
		else if (b === OP_MISS_FRONT_KNIT_BACK || b === OP_KNIT_BACK) return OP_TUCK_FRONT_KNIT_BACK;
	} else if (a === OP_KNIT_FRONT_MISS_BACK || a === OP_KNIT_FRONT) {
		if      (b === OP_MISS_FRONT_MISS_BACK) return OP_KNIT_FRONT_MISS_BACK;
		else if (b === OP_MISS_FRONT_TUCK_BACK || b === OP_TUCK_BACK) return OP_KNIT_FRONT_TUCK_BACK;
		else if (b === OP_MISS_FRONT_KNIT_BACK || b === OP_KNIT_BACK) return OP_KNIT_FRONT_KNIT_BACK;
	//operations are always front-then-back, so these don't make sense:
	//} else if (a === OP_MISS_FRONT_TUCK_BACK) {
	//	if      (b === OP_MISS_FRONT_MISS_BACK) return OP_MISS_FRONT_TUCK_BACK;
	//	else if (b === OP_TUCK_FRONT_MISS_BACK) return OP_TUCK_FRONT_TUCK_BACK;
	//	else if (b === OP_KNIT_FRONT_MISS_BACK) return OP_KNIT_FRONT_TUCK_BACK;
	//} else if (a === OP_MISS_FRONT_KNIT_BACK) {
	//	if      (b === OP_MISS_FRONT_MISS_BACK) return OP_MISS_FRONT_KNIT_BACK;
	//	else if (b === OP_TUCK_FRONT_MISS_BACK) return OP_TUCK_FRONT_KNIT_BACK;
	//	else if (b === OP_KNIT_FRONT_MISS_BACK) return OP_KNIT_FRONT_KNIT_BACK;
	}
	//I guess they can't be combined:
	return null;
}
//TO-DO add logic than ensures that pass direction changes if racking is not 0.5 & try to knit i.e. f1 & b1; otherwise, add to pass (assuming other conditions = true)

//different pass types:
//TO-DO define kn-kn etc. here (leave _ and - symbols)
const TYPE_SOFT_MISS = {}; //pass that exists only to host SOFT_MISS stitches, which can merge with knit or tuck passes
const TYPE_KNIT_x = {kcode:'Kn-Kn'};
const TYPE_x_KNIT = {kcode:'Kn-Kn'};
const TYPE_TUCK_x = {kcode:'Tu-Tu'};
const TYPE_x_TUCK = {kcode:'Tu-Tu'};
const TYPE_KNIT_KNIT = {kcode:'Kn-Kn'};
const TYPE_TUCK_KNIT = {kcode:'Tu-Kn'};
const TYPE_KNIT_TUCK = {kcode:'Kn-Tu'};
const TYPE_TUCK_TUCK = {kcode:'Tu-Tu'};

const TYPE_XFER_FOUR_PASS = {front:'Xf', back:'Xf'}; //will actually get split in output
const TYPE_XFER_TWO_PASS = {front:'Xf', back:'Xf'}; //will actually get split in output

const TYPE_SPLIT_TO_BACK_NEG = {kcode: 'Tr-Rl'};
const TYPE_SPLIT_TO_BACK_POS = {kcode: 'Tr-Rr'};
const TYPE_SPLIT_TO_FRONT_NEG = {kcode:'Rl-Tr'};
const TYPE_SPLIT_TO_FRONT_POS = {kcode:'Rr-Tr'};

function merge_types(a,b) {
	//same type, easy to merge:
	if (a === b) return a;

	//"soft miss" passes can merge with anything knit- or tuck- like:
	if (a === TYPE_SOFT_MISS) {
		if (b !== TYPE_XFER_FOUR_PASS && b !== TYPE_XFER_TWO_PASS) return b;
		else return null;
	}
	if (b === TYPE_SOFT_MISS) {
		if (a !== TYPE_XFER_FOUR_PASS && a !== TYPE_XFER_TWO_PASS) return a;
		else return null;
	}

	//types that only define one bed get merged:
	//TODO: determing whether TYPE_SPLIT_TO_BACK can be merged with TYPE_x_KNIT, or only TYPE_KNIT_x (and vice versa)
	if (a === TYPE_KNIT_x) {
		if (b === TYPE_x_KNIT || b === TYPE_KNIT_KNIT) return TYPE_KNIT_KNIT;
		else if (b === TYPE_x_TUCK || b === TYPE_KNIT_TUCK) return TYPE_KNIT_TUCK;
		else if (b === TYPE_SPLIT_TO_BACK_POS) return TYPE_SPLIT_TO_BACK_POS;
		else if (b === TYPE_SPLIT_TO_BACK_NEG) return TYPE_SPLIT_TO_BACK_NEG;
	} else if (a === TYPE_x_KNIT) {
		if (b === TYPE_KNIT_x || b === TYPE_KNIT_KNIT) return TYPE_KNIT_KNIT;
		else if (b === TYPE_TUCK_x || b === TYPE_TUCK_KNIT) return TYPE_TUCK_KNIT;
		else if (b === TYPE_SPLIT_TO_FRONT_POS) return TYPE_SPLIT_TO_FRONT_POS;
		else if (b === TYPE_SPLIT_TO_FRONT_NEG) return TYPE_SPLIT_TO_FRONT_NEG;
	} else if (a === TYPE_TUCK_x) {
		if      (b === TYPE_x_KNIT || b === TYPE_TUCK_KNIT) return TYPE_TUCK_KNIT;
		else if (b === TYPE_x_TUCK || b === TYPE_TUCK_TUCK) return TYPE_TUCK_TUCK;
	} else if (a === TYPE_x_TUCK) {
		if      (b === TYPE_KNIT_x || b === TYPE_KNIT_TUCK) return TYPE_KNIT_TUCK;
		else if (b === TYPE_TUCK_x || b === TYPE_TUCK_TUCK) return TYPE_TUCK_TUCK;
	} else if (a === TYPE_KNIT_KNIT) { //TODO: determine if split can be appended to passes with knitting on both beds
		if (b === TYPE_KNIT_x || b === TYPE_x_KNIT) return TYPE_KNIT_KNIT;
	} else if (a === TYPE_KNIT_TUCK) {
		if (b === TYPE_KNIT_x || b === TYPE_x_TUCK) return TYPE_KNIT_TUCK;
	} else if (a === TYPE_TUCK_KNIT) {
		if (b === TYPE_TUCK_x || b === TYPE_x_KNIT) return TYPE_TUCK_KNIT;
	} else if (a === TYPE_TUCK_TUCK) {
		if (b === TYPE_TUCK_x || b === TYPE_x_TUCK) return TYPE_TUCK_TUCK;
	} else if (a === TYPE_SPLIT_TO_BACK_POS) {
		if (b === TYPE_SPLIT_TO_BACK_POS || b === TYPE_KNIT_x) return TYPE_SPLIT_TO_BACK_POS;
	} else if (a === TYPE_SPLIT_TO_BACK_NEG) {
		if (b === TYPE_SPLIT_TO_BACK_NEG || b === TYPE_KNIT_x) return TYPE_SPLIT_TO_BACK_NEG;
	} else if (a === TYPE_SPLIT_TO_FRONT_POS) {
		if (b === TYPE_SPLIT_TO_FRONT_POS || b === TYPE_x_KNIT) return TYPE_SPLIT_TO_FRONT_POS;
	} else if (a === TYPE_SPLIT_TO_FRONT_NEG) {
		if (b === TYPE_SPLIT_TO_FRONT_NEG || b === TYPE_x_KNIT) return TYPE_SPLIT_TO_FRONT_NEG;
	}

	//return 'null' if no merge possible:
	return null;
}

//different pass yarn gripper actions:
const GRIPPER_IN = 'gripper-in'; //bring yarn in from gripper
const GRIPPER_OUT = 'gripper-out'; //bring yarn out to gripper

//pass directions:
const DIRECTION_LEFT = '-';
const DIRECTION_RIGHT = '+';
const DIRECTION_NONE = '';

//Pass stores information about a single machine pass:
function Pass(info) {
	//type: one of the TYPE_* constants (REQUIRED)
	//racking: number giving racking (REQUIRED)
	//slots: raster index -> operation
	//sizes: raster index -> stitch size numbers ({front:#, back:#})
	//speed: pass speed
	//direction: one of the DIRECTION_* constants
	//carriers: array of carriers, possibly of zero length
	//gripper: one of the GRIPPER_* constants or undefined
	['type', 'slots', 'direction', 'carriers', 'roller', 'gripper', 'racking', 'pause', 'speed', 'sizes'].forEach(function(name){
		if (name in info) this[name] = info[name];
	}, this);
	if (!('slots' in this)) this.slots = {};
	if (!('sizes' in this)) this.sizes = {};
	if (!('carriers' in this)) this.carriers = [];

	//Check that specification was reasonable:
	console.assert('type' in this, "Can't specify a pass without a type.");
	console.assert('racking' in this, "Can't specify a pass without a racking.");
	console.assert('speed' in this, "Can't specify a pass without a speed value.");

	//TO-DO pass sanity check
	// if (this.type === TYPE_KNIT_TUCK) {
	// 	if ('gripper' in this) {
	// 		console.assert(this.carriers.length !== 0, "Using GRIPPER_* with no carriers doesn't make sense.");
	// 		if (this.gripper === GRIPPER_IN) {
	// 			console.assert(!('hook' in this) || this.hook === HOOK_IN, "Must use GRIPPER_IN with HOOK_IN.");
	// 		} else if (this.gripper === GRIPPER_OUT) {
	// 			console.assert(!('hook' in this) || this.hook === HOOK_OUT, "Must use GRIPPER_OUT with HOOK_OUT.");
	// 		} else {
	// 			console.assert(false, "Pass gripper must be one of the GRIPPER_* constants.");
	// 		}
	// 	}
	// } else if (this.type === TYPE_SPLIT || this.type == TYPE_SPLIT_VIA_SLIDERS) {
	// 	//not clear if these are actually restrictions:
	// 	console.assert(!('gripper' in this), "Must use gripper only on KNIT_TUCK pass.");
	// 	console.assert(!('hook' in this), "Must use hook only on KNIT_TUCK pass.");
	// 	console.assert(this.carriers.length > 0, "Split passes should have yarn.");
	// } else if (this.type === TYPE_XFER || this.type === TYPE_XFER_TO_SLIDERS || this.type === TYPE_XFER_FROM_SLIDERS) {
	// 	console.assert(!('gripper' in this), "Must use gripper only on KNIT_TUCK pass.");
	// 	console.assert(!('hook' in this), "Must use hook only on KNIT_TUCK pass.");
	// 	console.assert(this.carriers.length === 0, "Transfer passes cannot have carriers specified.");
	// } else {
	// 	console.assert(false, "Pass type must be one of the TYPE_* constants.");
	// }

}

Pass.prototype.hasFront = function() {
	console.assert(this.type === TYPE_KNIT_TUCK, "It only makes sense to ask knit-tuck passes if they have front stitches.");
	for (let s in this.slots) {
		if ('isFront' in this.slots[s]) return true;
	}
	return false;
};
Pass.prototype.hasBack = function() {
	console.assert(this.type === TYPE_KNIT_TUCK, "It only makes sense to ask knit-tuck passes if they have back stitches.");
	for (let s in this.slots) {
		if ('isBack' in this.slots[s]) return true;
	}
	return false;
};

//'append' attempts to append a second pass to this pass.
//NOTE: only written for passes that actually perform operations, not for adding options.
Pass.prototype.append = function(pass) {

	//---- check if merge would work ----

	//pauses can't stack:
	if (pass.pause) {
		return false;
	}

	//some properties must match exactly:
	if (!['racking', 'speed', 'direction', 'carriers'].every(function(name){
		return JSON.stringify(this[name]) === JSON.stringify(pass[name]);
	}, this)) {
		return false;
	}

	//pass types must be merge-able:
	if (merge_types(this.type, pass.type) === null) {
		return false;
	}

	//it is okay to merge gripper operations in a few cases:
	if (!('gripper' in this) && !('gripper' in pass)) {
		//gripper in neither is fine
	} else if (this.gripper === GRIPPER_IN && !('gripper' in pass)) {
		//in at the start of the current pass is fine
	} else if (!('gripper' in this) && pass.gripper === GRIPPER_OUT) {
		//out at the end of the next pass is fine
	} else {
		//gripper operations are in conflict
		return false;
	}

	//must have a free slot for the new operation(s):
	//TO-DO change to halfPitch <-- actually this is okay, I think!
	let quarterPitch = (this.racking - Math.floor(this.racking) != 0.0);
	if (this.direction === DIRECTION_RIGHT) {
		//new operation needs to be to the right of other operations.
		let max = -Infinity;
		for (let s in this.slots) {
			max = Math.max(max, parseInt(s));
		}
		for (let s in pass.slots) {
			s = parseInt(s);
			if (s < max) {
				return false;
			} else if (s === max) {
				if (merge_ops(this.slots[s], pass.slots[s], quarterPitch) === null) {
					//needles are offset, but no way to do the current op and then the next op to the right
					return false;
				}
			} else {
				//great!
			}
		}
	} else if (this.direction === DIRECTION_LEFT) {
		//new operation needs to be to the left of other operations.
		let min = Infinity;
		for (let s in this.slots) {
			min = Math.min(min, parseInt(s));
		}
		for (let s in pass.slots) {
			s = parseInt(s);
			if (s > min) {
				return false;
			} else if (s === min) {
				if (merge_ops(pass.slots[s], this.slots[s], quarterPitch) === null) {
					//needles are offset, but no way to do the current op and then the next op to the left
					return false;
				}
			} else {
				//great!
			}
		}
	} else { console.assert(this.direction === DIRECTION_NONE, "Direction '" + this.direction + "' must be one of the DIRECTION_* constants.");
		for (let s in pass.slots) {
			if (s in this.slots) {
				//TODO: can one drop both front and back with aligned racking?
				if (merge_ops(this.slots[s], pass.slots[s], quarterPitch) === null
				&& merge_ops(pass.slots[s], this.slots[s], quarterPitch) === null) {
					//no way to merge operations in the same slot
					return false;
				}
			}
		}

	}

	//sizes must agree everywhere specified:
	for (let s in pass.sizes) {
		if (s in this.sizes) {
			if (('front' in pass.sizes[s]) && ('front' in this.sizes[s]) && pass.sizes[s].front !== this.sizes[s].front) {
				return false;
			}
			if (('back' in pass.sizes[s]) && ('back' in this.sizes[s]) && pass.sizes[s].back !== this.sizes[s].back) {
				return false;
			}
		}
	}

	//---- actually merge next pass ----

	this.type = merge_types(this.type, pass.type);
	console.assert(this.type !== null, "we checked that merge was valid");

	//merge gripper properties:
	if (!('gripper' in this) && ('gripper' in pass)) {
		this.gripper = pass.gripper;
	} else {
		console.assert(!('gripper' in pass), "we checked this");
	}

	//merge slots:
	for (let s in pass.slots) {
		if (s in this.slots) {
			if (this.direction === DIRECTION_RIGHT) {
				this.slots[s] = merge_ops(this.slots[s], pass.slots[s], quarterPitch);
				console.assert(this.slots[s] !== null, "we pre-checked this");
			} else if (this.direction === DIRECTION_LEFT) {
				this.slots[s] = merge_ops(pass.slots[s], this.slots[s], quarterPitch);
				console.assert(this.slots[s] !== null, "we pre-checked this");
			} else { console.assert(this.direction === DIRECTION_NONE, "Direction must be one of the DIRECTION_* constants.");
				let op = merge_ops(this.slots[s], pass.slots[s], quarterPitch);
				if (op === null) {
					op = merge_ops(pass.slots[s], this.slots[s], quarterPitch);
				}
				this.slots[s] = op;
				console.assert(this.slots[s] !== null, "we pre-checked this");
			}
		} else {
			this.slots[s] = pass.slots[s];
		}
	}
	
	//merge sizes:
	for (let s in pass.sizes) {
		if (!(s in this.sizes)) this.sizes[s] = {};
		if ('front' in pass.sizes[s]) this.sizes[s].front = pass.sizes[s].front;
		if ('back' in pass.sizes[s]) this.sizes[s].back = pass.sizes[s].back;
	}

	return true;
};




let carrierSpacing = 2;
let carrierDistance = 2.5;
let leftFloor = true,
	rightFloor = true;


//convert knitout code (read as a utf8 string) to a sequence of unified passes:
// returns {headers, passes}
// (the knitoutFile parameter is included in error messages)
function knitoutToPasses(knitout, knitoutFile) {
	let headers = {};
	let passes = [];


	//load file, split on lines:
	let lines = knitout.split('\n');
	let lineIdx = 0;

	//check for windows-style line endings:
	let complainAboutLineEndings = 0;
	for (let i = 0; i < lines.length; ++i) {
		if (lines[i].endsWith('\r')) {
			lines[i] = lines[i].substr(0, lines[i].length-1);
			complainAboutLineEndings = i+1;
		}
	}
	if (complainAboutLineEndings !== 0) {
		console.warn(`${knitoutFile}:${complainAboutLineEndings} WARNING: File contains some '\\r\\n'-style line endings, this is not specification-compliant.`);
	}

	(function checkVersion(){
		let m = lines[lineIdx].match(/^;!knitout-(\d+)$/);
		if (!m) {
			throw `${knitoutFile}:${lineIdx+1} File starts with '${lines[0]}', which is not a valid knitout magic string`;
		}
		if (parseInt(m[1]) > 2) {
			console.warn(`${knitoutFile}:${lineIdx+1} WARNING: File is version ${m[1]}, but this code only knows about versions up to 2.`);
		}
		++lineIdx;
	})();

	(function readHeaders(){
		//read header lines at the start of the file:
		for (; lineIdx < lines.length; ++lineIdx) {
			let line = lines[lineIdx];

			//comment headers must start with ';;':
			if (!line.startsWith(';;')) break;

			//comment headers must include the string ': ':
			let idx = line.indexOf(': ');
			if (idx === -1) {
				console.warn("Comment-header-like line '" + line + "' does not contain string ': ' -- interpreting as regular comment.");
				break;
			}
			let header = line.substr(2, idx-2);
			let value = line.substr(idx+2);

			if (header in headers) console.warn(`${knitoutFile}:${lineIdx+1} WARNING: header '${header}' specified more than once. Will use last value.`);
			if        (header === 'Carriers') {
				headers.Carriers = value.split(/[ ]+/); //this is slightly generous -- the spec says "space-separated" not "whitespace-separated"
			} else if (header === 'Machine') {
				headers.Machine = value; //TODO: check value
			} else if (header.startsWith('Yarn-')) {
				//TODO: check that carrier name is valid
			} else if (header === 'Gauge') {
				if (/^\d+\.?\d*$/.test(value) && parseFloat(value) > 0) {
					headers.Gauge = parseFloat(value);
				} else {
					throw `${knitoutFile}:${lineIdx+1} ERROR: Gauge header's value ('${value}') should be a number greater than zero.`;
				}
			} else if (header === 'Width') {
				if (/^\d+$/.test(value) && parseInt(value) > 0) {
					headers.Width = parseInt(value);
				} else {
					throw `${knitoutFile}:${lineIdx+1} ERROR: Width header's value should be a positive integer.`;
				}
			} else if (header === 'Position') {
				if (["Left", "Right", "Keep", "Center"].indexOf(value) !== -1) {
					headers.Position = value;
				} else {
					throw `${knitoutFile}:${lineIdx+1} ERROR: Positon header's value should be 'Left', 'Right', 'Keep', or 'Center'.`;
				}
			} else {
				console.warn(`${knitoutFile}:${lineIdx+1} WARNING: Unknown comment header '${header}'.`);
			}
		} //for (lines)

		//'Carriers:' header is required
		if (!('Carriers' in headers)) {
			throw `${knitoutFile}:${lineIdx+1} ERROR: 'Carriers:' header is required.`;
		}

		//TODO: revisit this, allow any carriers header?
		//This code requires Carriers to be 1 .. 10 in order:
		if (headers.Carriers.join(' ') !== '1 2 3 4 5 6') {
			throw `${knitoutFile}:${lineIdx+1} ERROR: 'Carriers:' header must be '1 2 3 4 5 6'.`;
		}

		//Set default 'Width' if not specified + report current value:
		if (!('Width' in headers)) {
			headers.Width = 252;
			console.log(`Width header not specified. Assuming beds are ${headers.Width} needles wide.`);
		} else {
			console.log(`Width header indicates beds are ${headers.Width} needles wide.`);
		}

		//Set default 'Position' if not specified + report current value:
		const DESCRIBE_POSITION = {
			"Center" : "center design on needle bed",
			"Keep" : "use needle numbers as written",
			"Left" : "left-justify design on needle bed",
			"Right" : "right-justify design on needle bed",
		};
		if (!('Position' in headers)) {
			headers.Position = 'Center';
			console.log("Position header not specified. Will " + DESCRIBE_POSITION[headers.Position] + " ('" + headers.Position + "').");
		} else {
			console.log("Will " + DESCRIBE_POSITION[headers.Position] + " as per position header '" + headers.Position + "'.");
		}

	})();

	let carriers = {}; //carriers are held in an "name" => object map.
	let racking = 0.0; //racking starts centered
	let stitch = '5'; //current stitch size number
	let xferStitch = '3'; //stitch size number for transfers
	let xferStyle = 'four-pass'; //how transfers are divided between passes
	let speed = 100; //machine-specific speed number
	let pausePending = false; //optional stop before next instruction, please
	let endPending = false; //end the current pass before the next instruction, please

	let pauseMessage; //message to put on screen when pausing the machine
	
	let roller = 100;
	let addRoller = 0;

	function slotNumber(bn) {
		if (bn.isFront()) {
			return bn.needle;
		} else {
			return bn.needle + Math.floor(racking);
		}
	}
	function slotString(bn) {
		return slotNumber(bn).toString();
	}

	function merge(pass, shouldNotKick) {
		let doPause = pausePending;
		pausePending = false;
		const doEnd = endPending;
		endPending = false;
		if (passes.length !== 0 && !doPause && !doEnd && passes[passes.length-1].append(pass)) {
			//great; pass was able to merge into existing pass no problem.
		} else {
			//need to start a new pass:

			//If there are carriers, make sure they start on the correct side of the pass:
			//which slot is this pass acting on?
			let passSlot;
			for (let s in pass.slots) {
				console.assert(typeof(passSlot) === 'undefined', "only one slot in pass to merge");
				passSlot = parseInt(s);
			}
			console.assert(typeof(passSlot) !== 'undefined', "exactly one slot in pass to merge");

			//which carriers are on the wrong side of this slot?
			let slotCs = {};
			let haveKick = false;
			function addKick(c, slot) {
				//console.log("  will kick " + c + " relative " + slot); //DEBUG
				if (!(slot in slotCs)) slotCs[slot] = [c];
				else slotCs[slot].push(c);
				haveKick = true;
			}
			pass.carriers.forEach(function(c){
				console.assert(c in carriers, "Carriers in passes should also be in the carrier set.");
				if (carriers[c].last !== null) { //only kick carriers not being brought in
					let kickSlot = slotNumber(carriers[c].kick.needle);
					//console.log(c + " is " + carriers[c].kick.direction + " of " + kickSlot + " (want to act " + pass.direction + " on " + passSlot + ")"); //DEBUG
					if (carriers[c].kick.direction === DIRECTION_LEFT) {
						//carrier is somewhere (one 'stopping distance', modulo racking) left of kickSlot

						//strict version -> "infinite" stopping distance:
						if (pass.direction === DIRECTION_LEFT) {
							//stopping distance might be as much as \infty, definitely need to kick
							addKick(c, kickSlot);
						} else { //pass.direction === DIRECTION_RIGHT
							if (kickSlot > passSlot) { //stopping distance might be as little as zero
								addKick(c, passSlot);
							}
						}
					} else { console.assert(carriers[c].kick.direction === DIRECTION_RIGHT, "carrier directions are only LEFT or RIGHT.");
						//carrier is somewhere (one 'stopping distance', modulo racking) right of carrierSlot

						//strict version -> "infinite" stopping distance:
						if (pass.direction === DIRECTION_RIGHT) {
							//stopping distance might be as much as \infty, definitely need to kick
							addKick(c, kickSlot);
						} else { //pass.direction === DIRECTION_LEFT
							if (kickSlot < passSlot) { //stopping distance might be as little as zero
								addKick(c, passSlot);
							}
						}
					}
				}
			});


			//if kicks are needed, do them recursively:
			if (haveKick) {
				//which direction do carriers need to be kicked?
				let d;
				if (pass.direction === DIRECTION_LEFT) d = DIRECTION_RIGHT;
				else if (pass.direction === DIRECTION_RIGHT) d = DIRECTION_LEFT;
				else console.assert(false, "Passes with carriers have either LEFT or RIGHT direction.");

				for (let slot in slotCs) {
					let info = { //TODO: decide whether should have 100 or 0 roller advance for soft misses
						type:TYPE_SOFT_MISS,
						slots:{},
						racking:racking,
						//sizes:{},
						roller: 0,
						speed:speed,
						carriers:slotCs[slot],
						direction:d
					};
					if (doPause) {
						info.pause = true;
						info.pauseMessage = pauseMessage;
						doPause = false;
					}
					info.slots[slot] = OP_SOFT_MISS;
					merge(new Pass(info), true);

					//console.log("Kicking " + JSON.stringify(slotCs[slot]) + " to the " + d + " of " + slot); //DEBUG

					//update carrier kick info:
					slotCs[slot].forEach(function(c){
						carriers[c].kick = {
							needle:new BedNeedle('f', parseInt(slot)),
							direction:d
						};
					});
				}

				if (doPause) {
					pass.pause = true;
					pass.pauseMessage = pauseMessage;
					doPause = false;
				}
				merge(pass, true); //should be fine, now. kicks shouldn't keep kicking...
				return;
			} else {
				//if kicks aren't needed, can just append the pass:
				if (doPause) {
					pass.pause = true;
					pass.pauseMessage = pauseMessage;
					doPause = false;
				}
				passes.push(pass);
			}
		}



		//TODO: update last stitch info for carriers *here* instead of ad-hoc elsewhere
		/* something like:
		if (pass.carriers.length > 0) {
			//which slot is this pass acting on?
			let passSlot;
			for (s in pass.slots) {
				console.assert(typeof(passSlot) === 'undefined', "only one slot in pass to merge");
				passSlot = parseInt(s);
			}

			cs.forEach(function(c){
				console.assert(c in carriers, "We should have thrown an error already if carrier isn't in carrier set.");
				carriers[c].last = { needle:n, direction:d };
			});
		}
		*/
	}

	//if the carriers not named in 'cs' have last set, kick so they won't overlap n
	function kickOthers(n,cs) {
		let ignore = {};
		cs.forEach(function(c){
			ignore[c] = true;
		});
		let needleSlot = slotNumber(n);
		for (let c in carriers) {
			let carrier = carriers[c];
			if (carrier.name in ignore) continue;
			if (carrier.last === null) continue;
			console.assert(carrier.kick !== null, "last and kick are always set at the same time");

			//where is carrier attached?
			let lastSlot = slotNumber(carrier.last.needle);
			let lastSlotSide = lastSlot;
			if (carrier.last.direction === DIRECTION_LEFT) {
				lastSlotSide -= 0.1;
			} else { console.assert(carrier.last.direction === DIRECTION_RIGHT, "carriers always have direction set to LEFT or RIGHT");
				lastSlotSide += 0.1;
			}

			//relative to what needle was carrier last parked?
			let kickSlot = slotNumber(carrier.kick.needle);
			if (lastSlotSide < needleSlot) {
				//carrier is attached to the left of the needle to be operated, so it needs to be kicked left!
				if (carrier.kick.direction === DIRECTION_LEFT && kickSlot <= needleSlot) {
					//Great: carrier is kicked left of something that is as least as far left as the needle
				} else {
					//Otherwise, need to kick left:
					let info = {
						type:TYPE_SOFT_MISS,
						slots:{},
						//sizes:{},
						racking:racking,
						roller: 0,
						speed:speed,
						carriers:[carrier.name],
						direction:DIRECTION_LEFT
					};
					info.slots[slotString(carrier.last.needle)] = OP_SOFT_MISS;

					merge(new Pass(info));

					carrier.kick.direction = DIRECTION_LEFT;
					carrier.kick.needle = new BedNeedle('f', lastSlot);
				}
			} else { console.assert(lastSlotSide > needleSlot, "lastSlotSide will be fractional, so must be > or < needleSlot");
				//carrier is attached to the right of the needle to be operated, so it needs to be kicked right
				if (carrier.kick.direction === DIRECTION_RIGHT && kickSlot >= needleSlot) {
					//Great: carrier is kicked right of something that is as least as far right as the needle
				} else {
					//Otherwise, need to kick right:
					let info = {
						type:TYPE_SOFT_MISS,
						slots:{},
						//sizes:{},
						racking:racking,
						roller: 0,
						speed:speed,
						carriers:[carrier.name],
						direction:DIRECTION_RIGHT
					};
					info.slots[slotString(carrier.last.needle)] = OP_SOFT_MISS;

					merge(new Pass(info));

					carrier.kick.direction = DIRECTION_RIGHT;
					carrier.kick.needle = new BedNeedle('f', lastSlot);
				}
			}
		}
	}

	//if carriers in 'cs' are marked to in, and add proper gripper ops to info and unmark them:
	function handleIn(cs, info) {
		if (cs.length === 0) return;
		let inInfo = null;
		cs.forEach(function(c){
			if (!(c in carriers)) throw `${knitoutFile}:${lineIdx+1} ERROR: using a carrier (${c}) that isn't active.`;
			if (carriers[c].in) {
				inInfo = carriers[c].in;
				carriers[c].in = null;
			}
		});
		if (inInfo) {
			if (JSON.stringify(inInfo.cs) !== JSON.stringify(cs)) throw `${knitoutFile}:${lineIdx+1} ERROR: first use of carriers ${JSON.stringify(cs)} doesn't match in info ${JSON.stringify(inInfo)}`;
			if (inInfo.op === 'in') {
				info.gripper = GRIPPER_IN;
			} else {
				console.assert(false, "inInfo.op must be 'in'");
			}
		}
	}

	//update the '.last' member of the given carriers:
	function setLast(cs, d, n) {
		console.assert(typeof(n) === 'object', "setLast needs a needle.");
		cs.forEach(function(c){
			console.assert(c in carriers, "We should have thrown an error already if carrier isn't in carrier set.");
			//last -- where carrier is attached
			//kick -- where carrier is parked
			carriers[c].last = { needle:n, direction:d };
			carriers[c].kick = { needle:n, direction:d };
		});
	}

	//read the remaining lines in the file:
	for ( ; lineIdx < lines.length; ++lineIdx) {
		let line = lines[lineIdx];

		//strip comments:
		let i = line.indexOf(';');
		if (i >= 0) line = line.substr(0, i);
		//tokenize:
		let tokens = line.split(/[ ]+/);
		//trim potentially empty first and last tokens:
		if (tokens.length > 0 && tokens[0] === "") tokens.shift();
		if (tokens.length > 0 && tokens[tokens.length-1] === "") tokens.pop();

		if (tokens.length == 0) continue; //empty line, skip

		let op = tokens.shift();
		let args = tokens;
		let expectNoCarriers = false;

		//Handle synonyms:
		if (op === 'amiss') {
			op = 'tuck';
			args.unshift('+');
			expectNoCarriers = true;
		} else if (op === 'drop') {
			op = 'knit';
			args.unshift('+');
			expectNoCarriers = true;
		} else if (op === 'xfer') {
			op = 'split';
			args.unshift('+');
			expectNoCarriers = true;
		}

		//Handle operations:
		if (op === 'inhook') {
			throw `${knitoutFile}:${lineIdx+1} ERROR: cannot 'inhook' on this machine.`;
		} else if (op === 'in') {
			let cs = args;
			if (cs.length === 0) throw `${knitoutFile}:${lineIdx+1} ERROR: Can't bring in no carriers`;

			cs.forEach(function(c){
				if (headers.Carriers.indexOf(c) === -1) {
					throw `${knitoutFile}:${lineIdx+1} ERROR: Can't use carrier '${c}' which isn't named in the Carriers comment header.`;
				}
			});

			cs.forEach(function(c){
				if (c in carriers) throw `${knitoutFile}:${lineIdx+1} ERROR: Can't bring in carrier '${c}' -- it is already active.`;
			});

			let inInfo = {op:op, cs:cs.slice()};
			//mark all carriers as pending:
			cs.forEach(function(c){
				let carrier = new Carrier(c);
				carrier.in = inInfo;
				carriers[c] = carrier;
			});
		} else if (op === 'releasehook') {
			throw `${knitoutFile}:${lineIdx+1} ERROR: cannot 'releasehook' on this machine.`;
		} else if (op === 'outhook') {
			throw `${knitoutFile}:${lineIdx+1} ERROR: cannot 'outhook' on this machine.`;
		} else if (op === 'out') {
			let cs = args;
			
			cs.forEach(function(c){
				if (!(c in carriers)) throw `${knitoutFile}:${lineIdx+1} ERROR: Can't bring out carrier '${c}' -- it isn't yet active.`;
				if (!carriers[c].last) throw `${knitoutFile}:${lineIdx+1} ERROR: Can't bring out carrier '${c}' -- it hasn't yet stitched.`;
			});

			//make a pass with (at least) a single *leftward* miss from which to take the carrier out:
			let s = -Infinity;
			let n = null;
			cs.forEach(function(c){
				let t = slotNumber(carriers[c].last.needle);
				if (t > s) {
					s = t;
					n = carriers[c].last.needle;
				}
			});
			let info = {
				type:TYPE_SOFT_MISS,
				slots:{},
				//sizes:{},
				racking:racking,
				roller: 0,
				speed:speed,
				carriers:cs,
				direction:DIRECTION_LEFT,
				gripper:GRIPPER_OUT,
			};
			if (addRoller !== 0) (roller -= addRoller), (addRoller = 0);
			info.slots[slotString(n)] = OP_SOFT_MISS;
			//TODO: probably need to figure out some special logic for bringing a carrier out

			merge(new Pass(info));

			//remove carriers from active set:
			cs.forEach(function(c){
				delete carriers[c];
			});
		} else if (op === 'rack') {
			if (args.length !== 1) throw `${knitoutFile}:${lineIdx+1} ERROR: racking takes one argument.`;
			if (!/^[+-]?\d*\.?\d+$/.test(args[0])) throw `${knitoutFile}:${lineIdx+1} ERROR: racking must be a number.`;
			let newRacking = parseFloat(args.shift());
			let frac = newRacking - Math.floor(newRacking);
			let quarter_frac = (frac == 0.25);
			if (quarter_frac) {
				newRacking += 0.25;
				frac = newRacking - Math.floor(newRacking);
			}
			if (frac != 0.0 && frac != 0.5) throw `${knitoutFile}:${lineIdx+1} ERROR: rackings must be an integer or an integer + 0.5`;
			racking = newRacking;
		} else if (op === 'stitch') {
			if (args.length !== 2) throw `${knitoutFile}:${lineIdx+1} ERROR: stitch takes two arguments.`;
			if (!/^[+-]?\d+$/.test(args[0]) || !/^[+-]?\d+$/.test(args[1])) throw `${knitoutFile}:${lineIdx+1} ERROR: stitch arguments must be integers.`;
			let newLeading = parseInt(args.shift());
			let newStitch = parseInt(args.shift());

			console.warn(`${knitoutFile}:${lineIdx+1} WARNING: 'stitch' command ignored; use x-stitch-number or build a proper translation table for stitch sizes.`);
		} else if (op === 'x-presser-mode') {
			console.warn(`${knitoutFile}:${lineIdx+1} WARNING: x-presser-mode not supported on this machine.`);
		} else if (op === 'x-end-pass') {
			if (args.length !== 0) throw `${knitoutFile}:${lineIdx+1} ERROR: x-end-pass takes no arguments.`;
			endPending = true;
		} else if (op === 'x-xfer-style') {
			if (args.length !== 1) throw `${knitoutFile}:${lineIdx+1} ERROR: x-xfer-style takes one argument.`;
			if (!(args[0] === 'four-pass' || args[0] === 'two-pass')) throw `${knitoutFile}:${lineIdx+1} ERROR: x-xfer-style must be 'four-pass' or 'two-pass'.`;
			xferStyle = args[0];
		} else if (op === 'x-speed-number') {
			if (args.length !== 1) throw `${knitoutFile}:${lineIdx+1} ERROR: x-speed-number takes one argument.`;
			if (!/^[+-]?\d*\.?\d+$/.test(args[0])) throw `${knitoutFile}:${lineIdx+1} ERROR: x-speed-number must be a number.`;
			speed = args[0];
		} else if (op === 'x-stitch-number' || op === 'x-xfer-stitch-number') {
			if (args.length !== 1) throw `${knitoutFile}:${lineIdx+1} ERROR: ${op} takes one argument.`;
			if (!/^[0-9A-Z]$/.test(args[0])) throw `${knitoutFile}:${lineIdx+1} ERROR: ${op} must be a number from 0-9 or a letter A-Z.`;
			if (op === 'x-stitch-number') stitch = args[0];
			if (op === 'x-xfer-stitch-number') xferStitch = args[0];
		} else if (op === 'x-carrier-spacing') {
			if (args.length !== 1) throw `${knitoutFile}:${lineIdx+1} ERROR: x-carrier-spacing takes one argument.`;
			if (!/^[+-]?\d*\.?\d+$/.test(args[0])) throw `${knitoutFile}:${lineIdx+1} ERROR: x-carrier-spacing must be a number.`;
			carrierSpacing = parseFloat(args.shift());
		} else if (op === 'x-carrier-stopping-distance') {
			if (args.length !== 1) throw `${knitoutFile}:${lineIdx+1} ERROR: x-carrier-stopping-distance takes one argument.`;
			if (!/^[+-]?\d*\.?\d+$/.test(args[0])) throw `${knitoutFile}:${lineIdx+1} ERROR: x-carrier-stopping-distance must be a number.`;
			carrierDistance = Math.floor(parseFloat(args.shift()));
			carrierDistance += 0.5;
		} else if (op === 'x-roller-advance') { //k-code specific extension
			if (args.length !== 1) throw `${knitoutFile}:${lineIdx+1} ERROR: x-roller-advance takes one argument.`;
			if (!/^[+-]?\d*\.?\d+$/.test(args[0])) throw `${knitoutFile}:${lineIdx+1} ERROR: x-roller-advance must be a number.`;
			roller = parseFloat(args[0]);
		} else if (op === 'x-add-roller-advance') { //k-code specific extension
			if (args.length !== 1) throw `${knitoutFile}:${lineIdx+1} ERROR: x-add-roller-advance takes one argument.`;
			if (!/^[+-]?\d*\.?\d+$/.test(args[0])) throw `${knitoutFile}:${lineIdx+1} ERROR: x-add-roller-advance must be a number.`;
			addRoller = parseFloat(args[0]);
			roller = roller + addRoller;
		} else if (op === 'miss' || op === 'tuck' || op === 'knit') {
			let d = args.shift();
			let n = new BedNeedle(args.shift());
			let cs = args;

			if (expectNoCarriers && cs.length !== 0) {
				throw `${knitoutFile}:${lineIdx+1} ERROR: cannot amiss/drop with carriers (use tuck/knit).`;
			}

			if (cs.length === 0) {
				if (op === 'miss') {
					throw `${knitoutFile}:${lineIdx+1} ERROR: it makes no sense to miss with no yarns.`;
				} else {
					d = DIRECTION_NONE; //a-miss and drop are directionless
				}
			}
			if (op === 'miss') {
				//miss doesn't care about other carriers
			} else {
				kickOthers(n,cs); //tuck and knit need carriers out of the way
			}

			let type;
			if      (op === 'knit') type = (n.isFront() ? TYPE_KNIT_x : TYPE_x_KNIT);
			else if (op === 'tuck') type = (n.isFront() ? TYPE_TUCK_x : TYPE_x_TUCK);
			else if (op === 'miss') type = TYPE_SOFT_MISS; //NOTE: this might not be exactly right

			let info = { //default: knit,tuck,miss -- roller advance = 100 (unless otherwise specified with x-add-roller-advance)
				type:type,
				slots:{},
				sizes:{},
				racking:racking,
				roller: roller,
				speed:speed,
				carriers:cs,
				direction:d,
			};
			if (addRoller !== 0) (roller -= addRoller), (addRoller = 0);

			if      (op === 'miss') info.slots[slotString(n)] = OP_SOFT_MISS;
			else if (op === 'tuck') info.slots[slotString(n)] = (n.isFront() ? OP_TUCK_FRONT : OP_TUCK_BACK);
			else if (op === 'knit') info.slots[slotString(n)] = (n.isFront() ? OP_KNIT_FRONT : OP_KNIT_BACK);
			else console.assert(false, "op was miss, tuck, or knit");

			//record stitch value for knit & tuck operations (but not miss):
			if (op === 'tuck' || op === 'knit') {
				info.sizes[slotString(n)] = {};
				info.sizes[slotString(n)][(n.isFront() ? 'front' : 'back')] = stitch;
			}

			handleIn(cs, info);

			merge(new Pass(info));

			setLast(cs, d, n);

		} else if (op === 'split') {
			let d = args.shift();
			let n = new BedNeedle(args.shift());
			let t = new BedNeedle(args.shift());
			let cs = args;

			if (expectNoCarriers && cs.length !== 0) {
				throw "ERROR: cannot xfer with carriers (use split).";
			}

			//make sure that 't' and 'n' align reasonably:
			if (n.isBack() && t.isFront()) {
				if (n.needle + racking !== t.needle) {
					throw "ERROR: needles '" + n + "' and '" + t + "' are not aligned at racking " + racking + ".";
				}
			} else if (n.isFront() && t.isBack()) {
				if (n.needle !== t.needle + racking) {
					throw "ERROR: needles '" + n + "' and '" + t + "' are not aligned at racking " + racking + ".";
				}
			} else {
				throw "ERROR: must xfer/split front <-> back.";
			}

			//make sure that this is a valid operation, and fill in proper OP:
			let type;
			if (cs.length !== 0) { //split case
				type = (n.isFront() ? (d === '+' ? TYPE_SPLIT_TO_BACK_POS: TYPE_SPLIT_TO_BACK_NEG) : (d === '+' ? TYPE_SPLIT_TO_FRONT_POS : TYPE_SPLIT_TO_FRONT_NEG));
				op = OP_SPLIT;
			} else { //xfer case
				d = ""; //xfer is directionless
				type = (xferStyle === 'four-pass' ? TYPE_XFER_FOUR_PASS : TYPE_XFER_TWO_PASS);
				op = (n.isFront() ? OP_XFER_TO_BACK : OP_XFER_TO_FRONT);
			}

			kickOthers(n,cs); //both xfer and split need carriers out of the way

			let info = { //default: xfer roller advance = 0 (unless otherwise specified with x-add-roller-advance)
				type:type,
				slots:{},
				sizes:{},
				racking:racking,
				//roller: roller, //?
				roller: 0 + addRoller,
				speed:speed,
				carriers:cs,
				direction:d,
			};
			if (addRoller !== 0) (roller -= addRoller), (addRoller = 0);

			info.slots[slotString(n)] = op;

			//record stitch for both source and target locations: (not sure if this matters):
			info.sizes[slotString(n)] = {};
			info.sizes[slotString(t)] = {};
			info.sizes[slotString(n)][(n.isFront() ? 'front' : 'back')] = (cs.length === 0 ? xferStitch : stitch);
			info.sizes[slotString(t)][(t.isFront() ? 'front' : 'back')] = (cs.length === 0 ? xferStitch : stitch);

			handleIn(cs, info);

			merge(new Pass(info));

			//update any carrier.last that pointed to this needle -- the stitch just got moved!
			for (let cn in carriers) {
				let c = carriers[cn];
				if (c.last && c.last.needle.bed == n.bed && c.last.needle.needle == n.needle) {
					c.last.needle = new BedNeedle(t.bed, t.needle);
				}
			}
			setLast(cs, d, n);
		} else if (op === 'pause') {
			if (pausePending) {
				console.warn(`${knitoutFile}:${lineIdx+1} WARNING: redundant pause instruction.`);
			}
			pausePending = true;
			args.length > 0 ? pauseMessage = args.join(' ') : pauseMessage = undefined;
		} else if (op === 'x-vis-color') {
			//do nothing -- visualization color doesn't matter to kcode creation!
		} else if (op.match(/^x-/)) {
			console.warn(`${knitoutFile}:${lineIdx+1} WARNING: unsupported extension operation '${op}'.`);
		} else {
			throw `${knitoutFile}:${lineIdx+1} ERROR: unsupported operation '${op}'.`;
		}


	} //for(lines)

	// test that all carriers were taken out
	{
	
		if (!(Object.entries(carriers).length === 0)){
			throw `${knitoutFile}:${lineIdx+1} ERROR: All carriers need to be taken out, out missing on carriers: ${Object.keys(carriers)}.`;
		}
	}

	//parse knitout to operations
	//for each operation, translate to color index
	//call pass.add(...), if fails, make a new pass and call pass.add(...)

	return { headers, passes };
}


//convert passes to kcode, reading values from headers:
// returns kcode as a string
function passesToKCode(headers, passes, kcFile) {

	//compute minimum and maximum slots both for each pass and for the program as a whole:
	let minSlot = Infinity;
	let maxSlot =-Infinity;
	passes.forEach(function(pass){
		pass.minSlot = Infinity;
		pass.maxSlot =-Infinity;
		for (let s in pass.slots) {
			let si = parseInt(s);
			pass.minSlot = Math.min(pass.minSlot, si);
			pass.maxSlot = Math.max(pass.maxSlot, si);
		}
		minSlot = Math.min(minSlot, pass.minSlot);
		maxSlot = Math.max(maxSlot, pass.maxSlot);
	});
	//console.log(minSlot, maxSlot); //DEBUG

	//For now, assume centered pattern when converting needles to slots / slots to needles:
	//gives the offset from slot i to needle n on the front bed:
	const slotToNeedle = (function(){
		if (headers.Position === 'Center') return Math.floor(0.5 * 252 - 0.5 * (maxSlot + minSlot));
		else if (headers.Position === 'Keep') return -1; //assume 1-based needle indexing for keep
		else if (headers.Position === 'Left') return -minSlot;
		else if (headers.Position === 'Right') return 251 - maxSlot;
		else throw "ERROR: unrecognized position header";
	})();
	function frontNeedleToSlot(n) { return n - slotToNeedle; }
	function backNeedleToSlot(n, racking) { return n + Math.floor(racking) - slotToNeedle; }


	//Now convert passes to 'kcode passes' by splitting xfer passes and adding any needed carriage moves:
	let kcodePasses = [];
	//each 'kcode pass' looks like:
	// {
	//    FRNT:'...---_---_- ... ----_---...',
	//    STIF:'555555555555 ... 55555555555',
	//    REAR:'...---_---_- ... ----_---...',
	//    STIR:'555555555555 ... 55555555555',
	//    RACK:1.0,
	//    carrier:5, //carrier index 1-6
	//    carrierLeft:12.5, carrierRight:27.5, //where carrier starts and ends (fractional front-bed needle position)
	//    //carriage info:
	//    carriageLeft:-5.5, carriageRight:-7.5, //where carriage starts and ends (fractional front-bed needle position)
	//    direction:DIRECTION_RIGHT,
	//    type:'Kn-Kn',
	//    speed:100, //carriage speed amount
	//    roller:0, //roller advance amount
	// }

	//yarn carrier state:
	//TODO: verify these starting positions (maybe they don't matter?)
	let carrierAt = {
		'1':CARRIER_PARKING[0],
		'2':CARRIER_PARKING[1],
		'3':CARRIER_PARKING[2],
		'4':CARRIER_PARKING[3],
		'5':CARRIER_PARKING[4],
		'6':CARRIER_PARKING[5]
	};

	//stopping distances past last-used needle location:
	//const CARRIER_STOP = 4.5;
	//const CARRIAGE_STOP = 4.5;

	//yarn carriage state:
	let nextDirection = DIRECTION_RIGHT;
	let leftStop =    0 - 11.5;
	let rightStop = 251 + 11.5;
	let rack = 0.0;

	//helper function to move carriage to other side of bed:
	function carriageMove() {
		console.assert(leftStop < rightStop, "carriage move with inverted stops"); //DEBUG
		//build a blank pass:
		let bed = '';
		let stitch = '';
		for (let i = 0; i < 15; ++i) {
			bed += '.';
			stitch += '0';
		}
		for (let i = 0; i < 252; ++i) {
			bed += '_';
			stitch += '0';
		}
		for (let i = 0; i < 15; ++i) {
			bed += '.';
			stitch += '0';
		}
		let pass = {
			FRNT:bed, STIF:stitch, REAR:bed, STIR:stitch,
			RACK:rack,
			direction:nextDirection,
			carriageLeft:leftStop,
			carriageRight:rightStop,
			type:'Kn-Kn',
			speed:300, //TODO: might make this faster since no knitting is happening
			roller:0,
			comment:"automatically inserted carriage move"
		};
		kcodePasses.push(pass);

		//update carriage info:
		nextDirection = (nextDirection === DIRECTION_RIGHT ? DIRECTION_LEFT : DIRECTION_RIGHT);
	}

	passes.forEach(function(pass){
		//soft miss will decay to an empty knit/tuck pass:
		if (pass.type === TYPE_SOFT_MISS) {
			//console.log("Decaying a SOFT_MISS to a tuck/tuck pass.");
			pass.type = TYPE_TUCK_TUCK;
			pass.comment = "(decayed from a SOFT_MISS)";
		}

		//helper: convert from sparse array of stitch sizes to dense STIF / STIR arrays:
		function sizesToSTI(sizes, direction, defaultStitch) {
			let STIF = [];
			let STIR = [];

			//fill in data from sizes array, using '*' for unknown:
			for (let i = 0; i < 15; ++i) {
				STIF.push('*');
				STIR.push('*');
			}
			for (let n = 0; n <= 252; ++n) {
				const f = frontNeedleToSlot(n);
				if (f in sizes && 'front' in sizes[f]) STIF.push(sizes[f].front);
				else STIF.push('*');
				const b = backNeedleToSlot(n, pass.racking);
				if (b in sizes && 'back' in sizes[b]) STIR.push(sizes[b].back);
				else STIR.push('*');
			}
			for (let i = 0; i < 15; ++i) {
				STIF.push('*');
				STIR.push('*');
			}

			//fill in known data from unknown data:
			function fill(STI) {
				for (let begin = 0; begin < STI.length; /* later */) {
					if (STI[begin] !== '*') {
						begin += 1;
						continue;
					}
					let end = begin + 1;
					while (end < STI.length && STI[end] === '*') ++end;
					//the range [begin, end) is all '*' now.

					//How it gets filled depends on the range type:
					if (begin === 0 && end === STI.length) {
						//range is the whole bed -- fill with some default:
						for (let i = begin; i < end; ++i) STI[i] = defaultStitch;
					} else if (begin === 0) { console.assert(end < STI.length);
						//range has only a right endpoint -- so fill with the value from this endpoint:
						for (let i = begin; i < end; ++i) STI[i] = STI[end];
					} else if (end === STI.length) { console.assert(begin > 0);
						//range has only a left endpoint -- so use the value from this endpoint:
						for (let i = begin; i < end; ++i) STI[i] = STI[begin-1];
					} else { console.assert(begin > 0 && end < STI.length);
						//range has both endpoints set -- use the "next" endpoint in pass direction:
						if (direction === DIRECTION_LEFT) {
							for (let i = begin; i < end; ++i) STI[i] = STI[begin-1];
						} else if (direction === DIRECTION_RIGHT) {
							for (let i = begin; i < end; ++i) STI[i] = STI[end];
						} else {
							console.assert(false, "Pass direction always known when setting STI*");
						}
					}

					//move forward:
					begin = end;
				}
			}
			fill(STIR);
			fill(STIF);

			return {STIF:STIF.join(''), STIR:STIR.join('')};
		}

		if (pass.type === TYPE_XFER_FOUR_PASS || pass.type === TYPE_XFER_TWO_PASS) {
			//this code is going to split the transfers into several passes, using this handy helper:
			function makeXferPass(direction, fromBed, toBed, checkNeedleFn, comment) {
				let xpass = {
					RACK:pass.racking,
					type:'Tr-Rr',
					//speed:202,
					speed: pass.speed,
					//roller:0,
					roller: pass.roller,
					direction:direction,
					carriageLeft:Infinity, //will get updated
					carriageRight:-Infinity, //will get updated
				};
				if (pass.comment) xpass.comment = pass.comment;
				if (pass.pause && pass.pauseMessage) xpass.pauseMessage = pass.pauseMessage;
				if (typeof(comment) !== 'undefined') {
					if ('comment' in xpass) xpass.comment += ' ' + comment;
					else xpass.comment = comment;
				}

				if (fromBed === 'f' && toBed === 'b' && direction === DIRECTION_RIGHT) {
					xpass.type = 'Tr-Rr';
				} else if (fromBed === 'f' && toBed === 'b' && direction === DIRECTION_LEFT) {
					xpass.type = 'Tr-Rl';
				} else if (fromBed === 'b' && toBed === 'f' && direction === DIRECTION_RIGHT) {
					xpass.type = 'Rr-Tr';
				} else if (fromBed === 'b' && toBed === 'f' && direction === DIRECTION_LEFT) {
					xpass.type = 'Rl-Tr';
				} else {
					throw new Error(`Invalid from/to/direction ${fromBed}/${toBed}/${direction} encountered.`);
				}

				xpass.FRNT = '';
				xpass.REAR = '';

				for (let i = 0; i < 15; ++i) {
					xpass.FRNT += '.';
					xpass.REAR += '.';
				}
				for (let n = 0; n <= 252; ++n) {
					xpass.FRNT += '_';
					xpass.REAR += '_';
				}
				for (let i = 0; i < 15; ++i) {
					xpass.FRNT += '.';
					xpass.REAR += '.';
				}
				//n.b. default is '3' for STIF/STIR

				function set(str, n) {
					console.assert(str[n] === '_', "Setting unset needle");
					return str.substr(0,n) + '-' + str.substr(n+1);
				}

				let sizes = {}; //subset of pass.sizes, will be used to set STIF/STIR later

				//fill in front/rear actions:
				for (let n = 0; n <= 252; ++n) {
					if (checkNeedleFn(n)) {
						if (fromBed === 'f') {
							xpass.FRNT = set(xpass.FRNT, 15 + n);
							xpass.REAR = set(xpass.REAR, 15 + n - pass.racking);
							xpass.carriageLeft = Math.min(xpass.carriageLeft, n - carrierDistance);
							xpass.carriageRight = Math.max(xpass.carriageRight, n + carrierDistance);

							//copy sizes:
							const f = frontNeedleToSlot(n);
							const b = backNeedleToSlot(n - pass.racking, pass.racking);
							console.assert(f in pass.sizes && 'front' in pass.sizes[f]); //size should be recorded for every operation!
							console.assert(b in pass.sizes && 'back' in pass.sizes[b]); //size should be recorded for every operation!
							if (!(f in sizes)) sizes[f] = {};
							if (!(b in sizes)) sizes[b] = {};
							sizes[f].front = pass.sizes[f].front;
							sizes[b].back = pass.sizes[b].back;

						} else { console.assert(fromBed === 'b', "only two options for fromBed");
							xpass.FRNT = set(xpass.FRNT, 15 + n + pass.racking);
							xpass.REAR = set(xpass.REAR, 15 + n);
							xpass.carriageLeft = Math.min(xpass.carriageLeft, n - carrierDistance);
							xpass.carriageRight = Math.max(xpass.carriageRight, n + carrierDistance);

							//copy sizes:
							const f = frontNeedleToSlot(n + pass.racking);
							const b = backNeedleToSlot(n, pass.racking);
							console.assert(f in pass.sizes && 'front' in pass.sizes[f]); //size should be recorded for every operation!
							console.assert(b in pass.sizes && 'back' in pass.sizes[b]); //size should be recorded for every operation!
							if (!(f in sizes)) sizes[f] = {};
							if (!(b in sizes)) sizes[b] = {};
							sizes[f].front = pass.sizes[f].front;
							sizes[b].back = pass.sizes[b].back;
						}
					}
				}

				//don't add pass if it's empty:
				if (xpass.carriageLeft > xpass.carriageRight) return;

				//expanded partial sizes into STIF/STIR (stitch values) for xpass:
				({STIF:xpass.STIF, STIR:xpass.STIR} = sizesToSTI(sizes, xpass.direction, '!')); //NOTE: using default value of '!' because both beds should always have at least *one* stitch size set if code got this far.

				if (xpass.direction !== nextDirection) {
					console.log("NOTE: 'wasting' a carriage move on an xfer pass.");
					carriageMove();
					console.assert(nextDirection === xpass.direction);
				}

				//shift previous pass's stopping point if needed:
				let prev = (kcodePasses.length > 0 ? kcodePasses[kcodePasses.length-1] : null);

				//update carriage starting/stopping points for this pass:
				if (xpass.direction === DIRECTION_LEFT) {
					//starting point:
					rightStop = xpass.carriageRight = Math.max(rightStop, xpass.carriageRight);
					//shift previous pass's stop as well:
					if (prev) prev.carriageRight = rightStop;
					//stopping point:
					leftStop = xpass.carriageLeft;
				} else {console.assert(xpass.direction === DIRECTION_RIGHT);
					//starting point:
					leftStop = xpass.carriageLeft = Math.min(leftStop, xpass.carriageLeft);
					//shift previous pass's stop as well:
					if (prev) prev.carriageLeft = leftStop;
					//stopping point:
					rightStop = xpass.carriageRight;
				}

				kcodePasses.push(xpass);
				nextDirection = (nextDirection === DIRECTION_RIGHT ? DIRECTION_LEFT : DIRECTION_RIGHT);
			}

			if (pass.type == TYPE_XFER_TWO_PASS) {
				//lazy all needles xfers:
				makeXferPass(nextDirection, 'f', 'b', (n) => {
					const f = frontNeedleToSlot(n);
					return (f in pass.slots && pass.slots[f].isFront);
				}, '[front-to-back]');

				makeXferPass(nextDirection, 'b', 'f', (n) => {
					const b = backNeedleToSlot(n, pass.racking);
					return (b in pass.slots && pass.slots[b].isBack);
				}, '[back-to-front]');
			} else {
				//fancy alternating needle xfers:
				let isEven = true;
				makeXferPass(nextDirection, 'f', 'b', (n) => {
					const f = frontNeedleToSlot(n);
					if (!(f in pass.slots && pass.slots[f].isFront)) return false;
					isEven = !isEven;
					return !isEven;
				}, '[front-to-back, even]');
				isEven = true;
				makeXferPass(nextDirection, 'f', 'b', (n) => {
					const f = frontNeedleToSlot(n);
					if (!(f in pass.slots && pass.slots[f].isFront)) return false;
					isEven = !isEven;
					return isEven;
				}, '[front-to-back, odd]');

				isEven = true;
				makeXferPass(nextDirection, 'b', 'f', (n) => {
					const b = backNeedleToSlot(n, pass.racking);
					if (!(b in pass.slots && pass.slots[b].isBack)) return false;
					isEven = !isEven;
					return !isEven;
				}, '[back-to-front, even]');
				isEven = true;
				makeXferPass(nextDirection, 'b', 'f', (n) => {
					const b = backNeedleToSlot(n, pass.racking);
					if (!(b in pass.slots && pass.slots[b].isBack)) return false;
					isEven = !isEven;
					return isEven;
				}, '[back-to-front, odd]');
			}

		} else {
			//some sort of knit/tuck pass:
			rack = pass.racking;
			let kpass = {
				RACK:rack,
				type:pass.type.kcode,
				//speed:100,
				speed: pass.speed,
				//roller:100,
				roller: pass.roller,
			};
			if (pass.comment) kpass.comment = pass.comment; //TODO: add header for pause/alert on screen
			if (pass.pause && pass.pauseMessage) kpass.pauseMessage = pass.pauseMessage;
			if (pass.gripper === GRIPPER_OUT) {
				kpass.comment = (kpass.comment || "") + "; carrier out";
			}

			//set pass direction and carrier info:
			if (pass.carriers.length === 0) {
				//really a drop/amiss pass...
				console.assert(pass.direction === DIRECTION_NONE);
				kpass.direction = nextDirection;
			} else {
				console.assert(pass.carriers.length === 1, "expecting zero or one carriers per pass");
				kpass.direction = pass.direction;

				kpass.carrier = pass.carriers[0];
				console.assert(kpass.carrier in carrierAt, "carrier '" + kpass.carrier + "' should be in carrierAt list.");

				//function to 'bump' a carrier over so it doesn't stack:
				function bump(carrier, stop, add) {
					let newStop = stop;
					let overlap = true;
					while (overlap) {
						overlap = false;
						for (let cn in carrierAt) {
							if (cn !== carrier) {
								if (carrierAt[cn] === newStop) {
									overlap = true;
									break;
								}
							}
						}
						if (overlap) {
							let bumpAdd = add;
							if (Math.abs(add) % 1 === 0.5) {
								if (add < 0) {
									leftFloor === true ? (bumpAdd = -Math.floor(-add)) : (bumpAdd = -Math.ceil(-add));
									if (newStop + bumpAdd !== stop) {
										leftFloor === true ? (leftFloor = false) : (leftFloor = true);
									}
								} else {
									rightFloor === true ? (bumpAdd = Math.floor(add)) : (bumpAdd = Math.ceil(add));
									if (newStop + bumpAdd !== stop) {
										rightFloor === true ? (rightFloor = false) : (rightFloor = true);
									}
								}
							}
							newStop += bumpAdd;
							//added option to have alternating carrier spacing (signified by whole number + 0.5 for x-carrier-spacing extension [i.e. x-carrier-spacing 1.5 alternates between having 1 and 2 spaces between carriers parked on a given side])
						////
						}
					}
					if (newStop !== stop) {
						console.log("Note: bumpped carrier " + carrier + " from " + stop + " to " + newStop + " to avoid other carriers.");
					}
					return newStop;
				}

				//set carrier stopping points:
				if (kpass.direction === DIRECTION_LEFT) {
					kpass.carrierRight = carrierAt[kpass.carrier];
					kpass.carrierLeft = pass.minSlot + slotToNeedle - carrierDistance;
					if (pass.gripper === GRIPPER_OUT) {
						//console.log("Carrier: " + JSON.stringify(pass.carriers[0]));
						const parkingSpot = CARRIER_PARKING[parseInt(pass.carriers[0])-1];
						console.log("Will park " + pass.carriers[0] + " at " + kpass.carrierLeft);
						console.assert(parkingSpot <= kpass.carrierLeft, "Parking spot should be left of any slots.");
						kpass.carrierLeft = parkingSpot;
					} else {
						//don't bump when parking carriers:
						kpass.carrierLeft = bump(kpass.carrier, kpass.carrierLeft, -carrierSpacing); //bump over to avoid stacking
					}
					carrierAt[kpass.carrier] = kpass.carrierLeft;
				} else { console.assert(kpass.direction === DIRECTION_RIGHT);
					kpass.carrierLeft = carrierAt[kpass.carrier];
					kpass.carrierRight = pass.maxSlot + slotToNeedle + carrierDistance;
					kpass.carrierRight = bump(kpass.carrier, kpass.carrierRight, carrierSpacing); //bump over to avoid stacking
					carrierAt[kpass.carrier] = kpass.carrierRight;
				}
			}

			//insert a carriage move pass if needed:
			if (kpass.direction !== nextDirection) {
				//perform carriage move:
				carriageMove();
				console.assert(nextDirection === kpass.direction);
				//NOTE: stopping point for carriage move will be updated in next block of code, if needed
			}

			//shift previous pass's stopping point if needed:
			let kprev = (kcodePasses.length > 0 ? kcodePasses[kcodePasses.length-1] : null);
			//update carriage starting/stopping points for this pass:
			if (kpass.direction === DIRECTION_LEFT) {
				//starting point:
				rightStop = Math.max(rightStop, pass.maxSlot + slotToNeedle + carrierDistance);
				if (pass.carriers.length !== 0) rightStop = Math.max(rightStop, kpass.carrierRight);
				//shift previous pass's stop as well:
				if (kprev) kprev.carriageRight = rightStop;
				//stopping point:
				leftStop = pass.minSlot + slotToNeedle - carrierDistance;
				if (kpass.carrierLeft) leftStop = Math.min(leftStop, kpass.carrierLeft);
			} else {console.assert(kpass.direction === DIRECTION_RIGHT);
				//starting point:
				leftStop = Math.min(leftStop, pass.minSlot + slotToNeedle - carrierDistance);
				if (pass.carriers.length !== 0) leftStop = Math.min(leftStop, kpass.carrierLeft);
				//shift previous pass's stop as well:
				if (kprev) kprev.carriageLeft = leftStop;
				//stopping point:
				rightStop = pass.maxSlot + slotToNeedle + carrierDistance;
				if (kpass.carrierRight) rightStop = Math.max(rightStop, kpass.carrierRight);
			}
			kpass.carriageLeft = leftStop;
			kpass.carriageRight = rightStop;

			//build needle selections:
			kpass.FRNT = '';
			kpass.REAR = '';

			for (let i = 0; i < 15; ++i) {
				kpass.FRNT += '.';
				kpass.REAR += '.';
			}
			for (let n = 0; n <= 252; ++n) {
				const f = frontNeedleToSlot(n);
				if (f in pass.slots && pass.slots[f].isFront) {
					kpass.FRNT += '-';
				} else {
					kpass.FRNT += '_';
				}
				const b = backNeedleToSlot(n, pass.racking);
				if (b in pass.slots && pass.slots[b].isBack) {
					kpass.REAR += '-';
				} else {
					kpass.REAR += '_';
				}
			}
			for (let i = 0; i < 15; ++i) {
				kpass.FRNT += '.';
				kpass.REAR += '.';
			}

			//build stitch values:
			({STIR:kpass.STIR, STIF:kpass.STIF} = sizesToSTI(pass.sizes, kpass.direction, '0')); //using default of '0' on an empty bed because it shouldn't really matter (might induce a bit more stitch cam motion than using something else -- like doing lookahead to the next value used by that stitch cam)

			kcodePasses.push(kpass);
			nextDirection = (nextDirection === DIRECTION_RIGHT ? DIRECTION_LEFT : DIRECTION_RIGHT);
		}
	});


	//Finally, write 'kcode passes', using some look-ahead / look-behind to figure out carriage turn-around points:
	let kcode = [];

	function out(x) {
		kcode.push(x);
		//console.log(x);
	}

	out("HOME");
	out("RACK:0");
	out(`// ${kcFile}`); //add name of .kc file as comment in header, since it needs to be changed to 'command.kc' for the machine to read it (so can remember original name)

	let lastRACK = 0.0;
	kcodePasses.forEach(function(kpass){
		//console.log("Doing:", kpass); //DEBUG
		if ('pauseMessage' in kpass) {
			out(kpass.pauseMessage);
		}
		out("//"); out("//"); out("//"); out("//"); //why do they do this?
		if ('comment' in kpass) {
			out("// " + kpass.comment);
		}
		if (kpass.RACK != lastRACK) {
			out("RACK:" + kpass.RACK);
			lastRACK = kpass.RACK;
		}
		let FRNT = kpass.FRNT;
		let REAR = kpass.REAR;
		let op = (kpass.direction === DIRECTION_RIGHT ? ">>" : "<<");
		op += " " + kpass.type;
		//insert carrier / carriage stopping points:
		console.assert(kpass.carriageLeft < kpass.carriageRight, "properly ordered carriage stops", kpass);
		console.assert(kpass.carriageLeft - Math.floor(kpass.carriageLeft) === 0.5, "carriage stop is properly fractional");
		console.assert(kpass.carriageRight - Math.floor(kpass.carriageRight) === 0.5, "carriage stop is properly fractional");
		//make into an index into the needle selection string:
		const carriageLeft = kpass.carriageLeft + 15.5;
		const carriageRight = kpass.carriageRight + 15.5;
		if ('carrier' in kpass) {
			op += " " + kpass.carrier;
			console.assert(kpass.carrierLeft < kpass.carrierRight, "properly ordered carrier stops");
			console.assert(kpass.carrierLeft - Math.floor(kpass.carrierLeft) === 0.5, "carrier stop is properly fractional");
			console.assert(kpass.carrierRight - Math.floor(kpass.carrierRight) === 0.5, "carrier stop is properly fractional");
			console.assert(kpass.carriageLeft <= kpass.carrierLeft, "carriage comes before carrier on the left");
			console.assert(kpass.carrierRight <= kpass.carriageRight, "carrier comes before carriage on the right", kpass); //DEBUG
			//make into an index into the needle selection string:
			const carrierLeft = kpass.carrierLeft + 15.5;
			const carrierRight = kpass.carrierRight + 15.5;
			//insert punctuation:
			FRNT = FRNT.substr(0,carriageRight) + '\\' + FRNT.substr(carriageRight);
			FRNT = FRNT.substr(0,carrierRight) + kpass.carrier + FRNT.substr(carrierRight);
			FRNT = FRNT.substr(0,carrierLeft) + kpass.carrier + FRNT.substr(carrierLeft);
			FRNT = FRNT.substr(0,carriageLeft) + '/' + FRNT.substr(carriageLeft);
			REAR = REAR.substr(0,carriageRight) + '\\' + REAR.substr(carriageRight);
			REAR = REAR.substr(0,carrierRight) + kpass.carrier + REAR.substr(carrierRight);
			REAR = REAR.substr(0,carrierLeft) + kpass.carrier + REAR.substr(carrierLeft);
			REAR = REAR.substr(0,carriageLeft) + '/' + REAR.substr(carriageLeft);
		} else {
			op += " " + "0";
			FRNT = FRNT.substr(0,carriageRight) + '\\' + FRNT.substr(carriageRight);
			FRNT = FRNT.substr(0,carriageLeft) + '/' + FRNT.substr(carriageLeft);
			REAR = REAR.substr(0,carriageRight) + '\\' + REAR.substr(carriageRight);
			REAR = REAR.substr(0,carriageLeft) + '/' + REAR.substr(carriageLeft);
		}
		op += " " + kpass.speed;
		op += " " + kpass.roller;

		out("FRNT:" + FRNT);
		out("STIF:" + kpass.STIF);
		out("REAR:" + REAR);
		out("STIR:" + kpass.STIR);
		out(op);
	});

	return kcode.join("\n") + "\n";
}


//-------------------------------
//driver code (if run from command line):

if (typeof(window) === 'undefined') {
	//parse command line
	if (process.argv.length != 4) {
		console.error("Usage:\nknitout-to-kcode.js <in.knitout> <out.kc>");
		process.exitCode = 1;
	} else {
		let knitoutFile = process.argv[2];
		let kcFile = process.argv[3];
		const fs = require('fs');
		console.log("Reading knitout from '" + knitoutFile + "'.");
		const knitout = fs.readFileSync(knitoutFile, 'utf8');
		const {headers, passes} = knitoutToPasses(knitout, knitoutFile);
		const kcode = passesToKCode(headers, passes, kcFile);
		console.log("Writing KCode to '" + kcFile + "'.");
		fs.writeFileSync(kcFile, kcode);
	}
}
