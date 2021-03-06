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

/*global module*/

function TaggedValue(val, tag) {
	this.value = val;
	this.tag = tag;
}

TaggedValue.prototype.getValue = function() {
	return this.value;
};

TaggedValue.prototype.getTag = function() {
	return this.tag;
};

module.exports = TaggedValue;