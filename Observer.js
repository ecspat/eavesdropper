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

/*global module */

function Observer() {
}

Observer.prototype.tagGlobal = 
Observer.prototype.tagLiteral =
Observer.prototype.tagForInVar =
Observer.prototype.tagNativeException =
Observer.prototype.tagNativeArgument =
Observer.prototype.tagNativeResult =
Observer.prototype.tagNewInstance =
Observer.prototype.tagNewNativeInstance =
Observer.prototype.tagUnOpResult =
Observer.prototype.tagBinOpResult = function() {
	return null;
};

Observer.prototype.tagPropRead = function(val, obj_tag, prop_tag, stored_tag) {
	return stored_tag;
};

Observer.prototype.tagPropWrite = function(val, obj_tag, prop_tag, val_tag, stored_tag) {
	return val_tag;
};

module.exports = Observer;