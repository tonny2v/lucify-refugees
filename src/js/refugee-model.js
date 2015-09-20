var _ = require('underscore');
var Refugee = require('./refugee.js');
var moment = require('moment');
var utils = require('./utils.js');

var RefugeeModel = function(mapModel, asylumData, regionalData, peoplePerPoint, labels) {
  this.mapModel = mapModel;
  this.labels = labels;
  this.refugees = [];
  this.activeRefugees = [];
  this.peoplePerPoint = peoplePerPoint;
  this.refugeesOnPath = {};
  this.arrivedRefugeesByCountry = {};
  this.currentMoment = null;
  this.refugeeIndex = 0;

  this.onRefugeeStarted = null;
  this.onRefugeeUpdated = null;
  this.onRefugeeFinished = null;

  console.time("asylum adding");
  asylumData.forEach(this._addPeopleFromValidCountries(true).bind(this));
  console.timeEnd("asylum adding");
  console.time("refugee adding");
  regionalData.forEach(this._addPeopleFromValidCountries(false).bind(this));
  console.timeEnd("refugee adding");
  console.time("refugee sorting");
  this.refugees.sort(function(a, b) {
    return a.startMomentUnix - b.startMomentUnix;
  });
  console.timeEnd("refugee sorting");
};


RefugeeModel.prototype._addPeopleFromValidCountries = function(isAsylumSeeker) {
  return function(item) {
    if (!this.mapModel.containsCountry(item.ac)) {
      console.log("asylum country " + item.ac +  " not in map, skipping");
    } else if (!this.mapModel.containsCountry(item.oc)) {
      console.log("origin country " + item.oc +  " not in map, skipping");
    } else {
      var refugeesToAdd = Math.round(item.count / this.peoplePerPoint);
      for (var i = 0; i < refugeesToAdd; i++) {
        this.refugees.push(this.createRefugee(item.oc, item.ac,
          item.month - 1, item.year, isAsylumSeeker));
      }
    }
  };
};

RefugeeModel.prototype._increaseRefugeeEnRoute = function(start, end) {
  if (!(start in this.refugeesOnPath)) {
    this.refugeesOnPath[start] = {};
  }
  if (!(end in this.refugeesOnPath[start])) {
    this.refugeesOnPath[start][end] = 1;
  } else {
    this.refugeesOnPath[start][end]++;
  }

  return this.refugeesOnPath[start][end];
};

RefugeeModel.prototype.update = function() {
  var r;

  // add new ones
  while ((r = this.refugees[this.refugeeIndex]) != null && r.isPastStartMoment(this.currentMoment)) {
    if (window.SMART_SPREAD_ENABLED) {
      r.setRouteRefugeeCount(this._increaseRefugeeEnRoute(r.startPoint, r.endPoint));
    }
    this.activeRefugees.push(r);
    this.refugeeIndex++;
    this.onRefugeeStarted(r);
  }

  // update current ones
  var stillActive = [];
  var length = this.activeRefugees.length;

  for (var i = 0; i < length; i++) {
    r = this.activeRefugees[i];
    r.update(this.currentMoment);

    if (r.arrived) {
      if (window.SMART_SPREAD_ENABLED) {
        this.refugeesOnPath[r.startPoint][r.endPoint]--;
      }
      this.countRefugeeArrived(r);
      this.onRefugeeFinished(r);
    } else {
      stillActive.push(r);
      this.onRefugeeUpdated(r);
    }
  }

  this.activeRefugees = stillActive;
};


/*
 * Get a speed for a new refugee in km / h;
 */
RefugeeModel.prototype.prepareRefugeeSpeed = function() {
  return Math.random() * 2 + 4;
};


RefugeeModel.prototype.prepareRefugeeEndMoment = function(month, year) {
  return moment(new Date(year, month, 1).getTime() +
    Math.random() * utils.daysInMonth(month, year) * 86400000); // ms in day
};

// note: month is 0-based
RefugeeModel.prototype.createRefugee = function(startCountry, endCountry, month, year, isAsylumSeeker) {
  var r = new Refugee(
    window.RANDOM_START_POINT ? this.mapModel.getRandomPointFromCountry(startCountry) : this.mapModel.getCenterPointOfCountry(startCountry),
    this.mapModel.getCenterPointOfCountry(endCountry),
    startCountry,
    endCountry,
    this.prepareRefugeeSpeed(),
    this.prepareRefugeeEndMoment(month, year),
    isAsylumSeeker
  );

  return r;
};

RefugeeModel.prototype.countRefugeeArrived = function(refugee) {
  if (!this.arrivedRefugeesByCountry[refugee.destinationCountry]) {
    this.arrivedRefugeesByCountry[refugee.destinationCountry] = {
      point: this.mapModel.getCenterPointOfCountry(refugee.destinationCountry),
      asylumApplications: 0,
      registeredRefugees: 0
    };
  }

  if (refugee.isAsylumSeeker) {
    this.arrivedRefugeesByCountry[refugee.destinationCountry].asylumApplications++;
  } else {
    this.arrivedRefugeesByCountry[refugee.destinationCountry].registeredRefugees++;
  }
}


module.exports = RefugeeModel;
