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
	return new TaggedValue(global, this.observer.tagGlobal(global));
};

var wrapLiteral = Runtime.prototype.wrapLiteral = function(pos, lit) {
	var res = new TaggedValue(lit, this.observer.tagLiteral(lit));
	if(Object(lit) === lit) {
		Object.defineProperty(lit, "__properties", { enumerable: false, writable: false, value: {} });
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
var enterFunction = Runtime.prototype.enterFunction = function() {};
var leaveFunction = Runtime.prototype.leaveFunction = function() {};

var callWrapped = Runtime.prototype.callWrapped = function(recv, args) {
	try {
		var wrapped_recv = this.wrapNativeReceiver(args.callee, recv),
		    wrapped_args = _.map(args, _.bind(wrapNativeArgument, this, args.callee));
		return args.callee.apply(wrapped_recv, wrapped_args);
	} catch(e) {
		throw unwrap(e);
	}
};

var methodcall = Runtime.prototype.methodcall = function(pos, recv, msg, args) {
	return this.funcall(pos, this.propread(null, recv, msg), recv, args);
};

var funcall = Runtime.prototype.funcall = function(pos, callee, recv, args) {
	var unwrapped_callee = callee.getValue();
	if(!unwrapped_callee)
		debugger;
	if(unwrapped_callee.__properties) {
		for(var i=args.length,n=unwrapped_callee.length;i<n;++i)
			args[i] = this.wrapLiteral();
		return unwrapped_callee.apply(recv, args);
	} else {
		var res = unwrapped_callee.apply(recv.getValue(), _.invoke(args, 'getValue'));
		if(!isWrapped(res))
			res = new TaggedValue(res, this.observer.tagNativeResult(res, callee, recv, args));
		return res;
	}
};

var newexpr = Runtime.prototype.newexpr = function(pos, callee, args) {
	var unwrapped_callee = callee.getValue(), res;
	if(unwrapped_callee.__properties) {
		var recv = new TaggedValue(Object.create(unwrapped_callee.prototype), this.observer.tagNewInstance(callee));
		res = this.methodcall(pos, callee, recv, args);
		return Object(res) === res ? res : recv;
	} else {
		var a = [];
		for(var i=0,n=args.length;i<n;++i)
			a[i] = 'args[' + i + ']';
		res = eval('new unwrapped_callee(' + a.join() + ')');
		if(!isWrapped(res))
			res = new TaggedValue(res, this.observer.tagNewNativeInstance(res, callee, args));
		return res;
	}
};

var prepareArguments = Runtime.prototype.prepareArguments = function(args) {
	var wrapped_args = this.wrapLiteral(args);
	var new_args = new TaggedValue(arguments, wrapped_args.getTag());
	
	for(var i=0,n=args.length;i<n;++i)
		this.propwrite(null, new_args, this.wrapLiteral(i), false, args[i]);
		
	for(;i<arguments.length;++i)
		delete args[i];
	
	this.propwrite(null, new_args, this.wrapLiteral("__proto__"), false, this.wrapLiteral(args.__proto__));
	this.propwrite(null, new_args, this.wrapLiteral("length"), false, this.wrapLiteral(args.length));
	this.propwrite(null, new_args, this.wrapLiteral("callee"), false, this.wrapLiteral(args.callee));
	
	return new_args;
};

var binop = Runtime.prototype.binop = function(pos, left, op, right) {
	if(!isWrapped(left) || !isWrapped(right))
		debugger;
	var res = eval("left.getValue()" + op + " right.getValue()");
	return new TaggedValue(res, this.observer.tagBinOpResult(res, left.getTag(), op, right.getTag()));
};

var unop = Runtime.prototype.unop = function(pos, op, arg) {
	var res = eval(op + " arg.getValue()");
	return new TaggedValue(res, this.observer.tagUnOpResult(res, op, arg.getTag()));
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
	return new TaggedValue(res, this.observer.tagPropRead(res, obj.getTag(), prop.getTag(), stored_tag));
};

var propwrite = Runtime.prototype.propwrite = function(pos, obj, prop, isDynamic, val) {
	var unwrapped_obj = obj.getValue(), unwrapped_prop = prop.getValue(), unwrapped_val = val.getValue();
	var old_tag = getPropertyTag(unwrapped_obj, unwrapped_prop);
	unwrapped_obj[unwrapped_prop] = unwrapped_val;
	setPropertyTag(unwrapped_obj, unwrapped_prop, this.observer.tagPropWrite(unwrapped_val, obj.getTag(), prop.getTag(), val.getTag(), old_tag));
	return val;
};

var propdel = Runtime.prototype.propdel = function(pos, obj, prop, isDynamic) {
	var unwrapped_obj = obj.getValue(), unwrapped_prop = prop.getValue();
	var res = delete unwrapped_obj[unwrapped_prop];
	deletePropertyTag(unwrapped_obj, unwrapped_prop);
	return res;
};

module.exports = Runtime;