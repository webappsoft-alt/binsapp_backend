import mongoose from "mongoose";
export const isValidObjectId = (id) => {
  return (
    mongoose.Types.ObjectId.isValid(id) &&
    new mongoose.Types.ObjectId(id).toString() === id
  );
};

export class CoordinateValidator {
  static isValidLatitude(lat) {
    return typeof lat === 'number' && !isNaN(lat) && lat >= -90 && lat <= 90;
  }

  static isValidLongitude(lng) {
    return typeof lng === 'number' && !isNaN(lng) && lng >= -180 && lng <= 180;
  }

  static isValidCoordinate(lat, lng) {
    return this.isValidLatitude(lat) && this.isValidLongitude(lng);
  }

  static validateCoordinate(lat, lng, coordinateName = 'coordinate') {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new Error(`${coordinateName}: Coordinates must be numbers, got lat:${typeof lat}, lng:${typeof lng}`);
    }
    
    if (isNaN(lat) || isNaN(lng)) {
      throw new Error(`${coordinateName}: Coordinates cannot be NaN`);
    }
    
    if (!this.isValidLatitude(lat)) {
      throw new Error(`${coordinateName}: Latitude must be between -90 and 90, got: ${lat}`);
    }
    
    if (!this.isValidLongitude(lng)) {
      throw new Error(`${coordinateName}: Longitude must be between -180 and 180, got: ${lng}`);
    }
    
    return true;
  }

  static validateAddress(address, addressName = 'address') {
    if (!address || typeof address !== 'object') {
      throw new Error(`${addressName}: Must be an object`);
    }
    
    if (address.lat === undefined || address.long === undefined) {
      throw new Error(`${addressName}: Must contain lat and long properties`);
    }
    
    return this.validateCoordinate(address.lat, address.long, addressName);
  }

  static validateAddresses(addresses) {
    const results = {
      isValid: true,
      errors: [],
      validAddresses: []
    };

    Object.entries(addresses).forEach(([name, address]) => {
      try {
        this.validateAddress(address, name);
        results.validAddresses.push({ name, address });
      } catch (error) {
        results.isValid = false;
        results.errors.push(error.message);
      }
    });

    return results;
  }

  // Quick validation without throwing errors (returns boolean)
  static quickValidateRoute(startAddress, endAddress, steps = []) {
    const isStartValid = startAddress && this.isValidCoordinate(startAddress.lat, startAddress.long);
    const isEndValid = endAddress && this.isValidCoordinate(endAddress.lat, endAddress.long);
    const areStepsValid = steps.every(step => step && this.isValidCoordinate(step.lat, step.long));
    
    return isStartValid && isEndValid && areStepsValid;
  }

  // Get validation summary for logging/debugging
  static getValidationSummary(startAddress, endAddress, steps = []) {
    return {
      startAddress: this.isValidCoordinate(startAddress?.lat, startAddress?.long),
      endAddress: this.isValidCoordinate(endAddress?.lat, endAddress?.long),
      steps: steps.map(step => this.isValidCoordinate(step?.lat, step?.long)),
      allValid: this.quickValidateRoute(startAddress, endAddress, steps)
    };
  }
}
