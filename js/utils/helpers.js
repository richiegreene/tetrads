
import { primes } from '../constants.js';

// It's generally better to avoid modifying prototypes of built-in objects.
// These functions are rewritten to be pure functions.

export function sumArray(arr1, arr2) {
	var sum = [];
	if (arr2 != null && arr1.length == arr2.length) {
		for (var i = 0; i < arr1.length; i++) {
			sum.push(arr1[i] + arr2[i]);
		}
	}
	return sum;
} 

export function diffArray(arr1, arr2) {
	var diff = [];
	if (arr2 != null && arr1.length == arr2.length) {
		for (var i = 0; i < arr1.length; i++) {
			diff.push(arr1[i] - arr2[i]);
		}
	}
	return diff;
}

export function productArray(arr1, arr2) {
	var product = [];
	if (arr2 != null && arr1.length == arr2.length) {
		for (var i = 0; i < arr1.length; i++) {
			product.push(arr1[i] * arr2[i]);
		}
	}
	return product;
}

export function divideArray(arr1, arr2) {
	var divide = [];
	if (arr2 != null && arr1.length == arr2.length) {
		for (var i = 0; i < arr1.length; i++) {
			divide.push(arr1[i] / arr2[i]);
		}
	}
	return divide;
}

export function lowestTermsArray(arr1, arr2) {
	var returnLowestTerms = [[],[]];
	if (arr2 != null && arr1.length == arr2.length) {
		for (var i = 0; i < arr1.length; i++) {
			returnLowestTerms[0].push(arr1[i] - Math.min(arr1[i],arr2[i]));
			returnLowestTerms[1].push(arr2[i] - Math.min(arr1[i],arr2[i]))
		}
	}
	return returnLowestTerms;
}

export function powersArray(arr1, arr2) {
	var powers = [];
	if (arr2 != null && arr1.length == arr2.length) {
		for (var i = 0; i < arr1.length; i++) {
			powers.push(Math.pow(arr1[i], arr2[i]));
		}
	}
	return powers;
}

export function sum(array) {
	var sum = 0;
	for (var i = 0; i < array.length; i++) {
		sum = sum + array[i];
	}
	return sum;
}

export function multiply(array) {
	var mult = 1;
	for (var i = 0; i < array.length; i++) {
		mult = mult * array[i];
	}
	return mult;
}

export function reduce(numerator,denominator){
	var gcd = function gcd(a,b){
		return b ? gcd(b, a%b) : a;
	};
	gcd = gcd(numerator,denominator);
	return [numerator/gcd, denominator/gcd];
}

export function getArray(integer){
	var result = [];
	for(let i = 0; i < primes.length; i++){
		result.push(0);
		while(integer % primes[i] == 0){
			result[i]++;
			integer = integer / primes[i];
		}
	}
	return result;
}

export function getValue(arr){
	return multiply(powersArray(primes, arr));
}

export function mod(n,m) {
	return ((n % m) + m) % m;
}
