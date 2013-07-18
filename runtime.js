/*******************************************************************************
 * Copyright (c) 2013 Max Schaefer.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *     Max Schaefer - initial API and implementation
 *******************************************************************************/

/*global require module */

var TaggedValue = require('./TaggedValue'),
    _ = require('underscore');

function Runtime(observer) {
	this.observer = observer;
}

var isWrapped = Runtime.prototype.isWrapped = function(val) {
	return val instanceof TaggedValue;
};

var unwrap = Runtime.prototype.unwrap = function(val) {
	return isWrapped(val) ? val.getValue() : val;
};

var wrapGlobal = Runtime.prototype.wrapGlobal = function(pos, global) {
	var tag = this.observer.tagGlobal(global);
	Object.defineProperty(global, "__properties", { enumerable: false, writable: false, value: {} });
	Object.defineProperty(global, "__tag", { enumerable: false, writable: false, value: tag });
	var tagged_global = new TaggedValue(global, tag);
	this.observer.setGlobal(tagged_global);
	return tagged_global;
};

var wrapLiteral = Runtime.prototype.wrapLiteral = function(pos, lit) {
	var res = new TaggedValue(lit, this.observer.tagLiteral(lit));
	
	if(Object(lit) === lit) {
		Object.defineProperty(lit, "__properties", { enumerable: false, writable: false, value: {} });
		Object.defineProperty(lit, "__tag", { enumerable: false, writable: false, value: res.getTag() });
		
		for(var p in lit) {
			if(lit.hasOwnProperty(p)) {
				var v = lit[p];
				lit[p] = v.getValue();
				this.propwrite(pos, res, new TaggedValue(p, this.observer.tagLiteral(p)), false, v);
			}
		}
		
		if(typeof lit === 'function') {
			this.propwrite(pos, res, new TaggedValue('prototype', this.observer.tagLiteral('prototype')), false, new TaggedValue(lit.prototype, this.observer.tagDefaultPrototype(lit.prototype)));
			// also tag name, arguments, length, caller? what about prototype.constructor?
		}
	}
	return res;
};

var wrapForInVar = Runtime.prototype.wrapForInVar = function(pos, prop) {
	return new TaggedValue(prop, this.observer.tagForInVar(prop));
};

var wrapNativeException = Runtime.prototype.wrapNativeException = function(pos, exn) {
	return new TaggedValue(exn, this.observer.tagNativeException(exn));
};

var wrapNativeArgument = Runtime.prototype.wrapNativeArgument = function(callee, arg, idx) {
	return new TaggedValue(arg, this.observer.tagNativeArgument(callee, arg, idx+1));
};

var wrapNativeReceiver = Runtime.prototype.wrapNativeReceiver = function(callee, recv) {
	return new TaggedValue(recv, this.observer.tagNativeArgument(callee, recv, 0));
};

var enterScript = Runtime.prototype.enterScript = function() {};
var leaveScript = Runtime.prototype.leaveScript = function() {};

var enterFunction = Runtime.prototype.enterFunction = function(pos, callee) {
	this.observer.enterFunction(callee);
};

var returnFromFunction = Runtime.prototype.returnFromFunction = function(retval) {
	this.observer.returnFromFunction(retval);
};

var leaveFunction = Runtime.prototype.leaveFunction = function() {
	this.observer.leaveFunction();
};

var callWrapped = Runtime.prototype.callWrapped = function(recv, args) {
	try {
		var wrapped_recv = this.wrapNativeReceiver(args.callee, recv),
		    wrapped_args = _.map(args, _.bind(wrapNativeArgument, this, args.callee));
		for(var i=wrapped_args.length,n=args.callee.length;i<n;++i)
			wrapped_args[i] = new TaggedValue(void(0), this.observer.tagLiteral());
		return args.callee.apply(wrapped_recv, wrapped_args);
	} catch(e) {
		throw unwrap(e);
	}
};

var methodcall = Runtime.prototype.methodcall = function(pos, recv, msg, args) {
	return this.funcall(pos, this.propread(null, recv, msg), recv, args);
};

var funcall = Runtime.prototype.funcall = function(pos, callee, recv, args, isNew) {
	if(!isNew)
		this.observer.funcall(pos, callee, recv, args);
	var unwrapped_callee = callee.getValue();
	if(unwrapped_callee.__tag) {
		for(var i=args.length,n=unwrapped_callee.length;i<n;++i)
			args[i] = new TaggedValue(void(0), this.observer.tagLiteral());
		return unwrapped_callee.apply(recv, args);
	} else {
		var res = unwrapped_callee.apply(recv.getValue(), _.invoke(args, 'getValue'));
		if(!isWrapped(res))
			res = new TaggedValue(res, this.observer.tagNativeResult(res, callee, recv, args));
		return res;
	}
};

var newexpr = Runtime.prototype.newexpr = function(pos, callee, args) {
	this.observer.newexpr(pos, callee, args);
	var unwrapped_callee = callee.getValue(), res;
	if(unwrapped_callee.__tag) {
		var new_instance = Object.create(unwrapped_callee.prototype);
		var recv = new TaggedValue(new_instance, this.observer.tagNewInstance(new_instance, callee, args));
		res = this.funcall(pos, callee, recv, args, true);
		return Object(res.getValue()) === res.getValue() ? res : recv;
	} else {
		var a = [];
		for(var i=0,n=args.length;i<n;++i)
			a[i] = 'args[' + i + '].getValue()';
		res = eval('new unwrapped_callee(' + a.join() + ')');
		if(!isWrapped(res))
			res = new TaggedValue(res, this.observer.tagNewNativeInstance(res, callee, args));
		return res;
	}
};

var prepareArguments = Runtime.prototype.prepareArguments = function(args) {
	var args_copy = args,
		new_args = new TaggedValue(arguments, this.observer.tagLiteral(args));
		
	Object.defineProperty(arguments, "__properties", { enumerable: false, writable: false, value: {} });
	
	for(var i=0,n=args_copy.length;i<n;++i) {
		arguments[i] = args_copy[i].getValue();
		setPropertyTag(arguments, args_copy[i].getTag());
	}
		
	for(;i<arguments.length;++i)
		delete arguments[i];
	
	arguments.__proto__ = args_copy.__proto__;
	arguments.length = args_copy.length;
	arguments.callee = args_copy.callee;
	setPropertyTag(arguments, '__proto__', this.observer.tagLiteral(arguments.__proto__));
	setPropertyTag(arguments, 'length', this.observer.tagLiteral(arguments.length));
	setPropertyTag(arguments, 'callee', arguments.callee.hasOwnProperty('__tag') && arguments.callee.__tag || this.observer.tagLiteral(arguments.callee));
	
	return new_args;
};

var binop = Runtime.prototype.binop = function(pos, left, op, right) {
	var res = eval("left.getValue()" + op + " right.getValue()");
	return new TaggedValue(res, this.observer.tagBinOpResult(res, left, op, right));
};

var unop = Runtime.prototype.unop = function(pos, op, arg) {
	var res = eval(op + " arg.getValue()");
	return new TaggedValue(res, this.observer.tagUnOpResult(res, op, arg));
};

function getPropertyTag(obj, prop) {
	return obj.hasOwnProperty('__properties') && obj.__properties['$' + prop];
}

function setPropertyTag(obj, prop, tag) {
	if(obj.hasOwnProperty('__properties'))
		obj.__properties['$' + prop] = tag;
}

function deletePropertyTag(obj, prop) {
	if(obj.hasOwnProperty('__properties'))
		delete obj.__properties['$' + prop];
}

var propread = Runtime.prototype.propread = function(pos, obj, prop, isDynamic) {
	var unwrapped_obj = obj.getValue(), unwrapped_prop = prop.getValue();
	var res = unwrapped_obj[unwrapped_prop];
	var stored_tag = getPropertyTag(unwrapped_obj, unwrapped_prop);
	return new TaggedValue(res, this.observer.tagPropRead(res, obj, prop, stored_tag));
};

var propwrite = Runtime.prototype.propwrite = function(pos, obj, prop, isDynamic, val) {
	var unwrapped_obj = obj.getValue(), unwrapped_prop = prop.getValue(), unwrapped_val = val.getValue();
	var old_tag = getPropertyTag(unwrapped_obj, unwrapped_prop);
	unwrapped_obj[unwrapped_prop] = unwrapped_val;
	setPropertyTag(unwrapped_obj, unwrapped_prop, this.observer.tagPropWrite(obj, prop, val, old_tag));
	return val;
};

var propdel = Runtime.prototype.propdel = function(pos, obj, prop, isDynamic) {
	var unwrapped_obj = obj.getValue(), unwrapped_prop = prop.getValue();
	var res = delete unwrapped_obj[unwrapped_prop];
	deletePropertyTag(unwrapped_obj, unwrapped_prop);
	return res;
};

module.exports = Runtime;