/*deals with formatting and calculations */

/* converts Date object to sql format */
jsDateToSql = function (jsDate) {
  if (jsDate === false) return false;
  else {
    let sqlDate = `${new Date(jsDate)
      .toISOString()
      .slice(0, 19)
      .replace(`T`, ` `)}`;
    return sqlDate;
  }
};

/* converts sql date stored as text to js Date */
jsDateFromSql = function (sqlDate) {
  return new Date(sqlDate.slice(0, sqlDate.length - 1)).getTime();
};

/* returns error with information what is wrong and with which data row from csv file */
constructError = (entry, entryIndex, problem) => {
  return new Error(
    `${problem} in entry ${entry} (data row ${entryIndex + 1} )`
  );
};

/* checks if csv data are correct and if yes add missing log and project info for bulk record to sql */
formatFileData = (data, currentLog, currentProject) => {
  for (let index = 0; index < data.length; index++) {
    if (data[index].length > 4) {
      return constructError(data[index], index, `too much data in entry`);
    }
    if (!/^[0-9]+$/.test(data[index][0]))
      return constructError(
        data[index],
        index,
        `user id should be a number and is ${data[index][0]}`
      );

    data[index][1] = jsDateToSql(data[index][1]);
    if (data[index][2] === '0' || data[index][2] === '1') {
      currentLog = data[index][2];
    } else if (data[index][2] === '' || data[index][2] === ' ') {
      currentLog = currentLog == 1 ? 0 : 1;
      data[index][2] = currentLog;
    } else
      return constructError(
        data[index],
        index,
        `invalid log status ${data[index][2]}`
      );

    // if (element[2] === '' || element[2] === ' ') {
    //   currentLog = currentLog == 1 ? 0 : 1;
    //   element[2] = currentLog;
    // } else currentLog = element[2];
    if (
      data[index][3] === '' ||
      data[index][3] === ' ' ||
      typeof data[index][3] == 'undefined'
    ) {
      data[index][3] = currentProject;
    } else {
      if (currentLog === 0) {
        if (data[index][3] != currentProject) {
          let tempProj = data[index][3];
          data[index][3] = currentProject;
          currentProject = tempProj;
        }
      }
    }
  }
  return data;
};

timeDifference = function (time1, time2) {
  return new Date(time2).getTime() - new Date(time1).getTime();
};

projectTimeInHours = function (entries) {
  let entryIndex = 0,
    totalTime = 0,
    currentTime = new Date().getTime();
  if (entries[0]['LogStatus'] == 0)
    return new Error(
      `impossible to determine when employee ${entries[0]['EmployeeId']} started to work on the project`
    );
  while (entryIndex < entries.length - 1) {
    if (entries[entryIndex]['LogStatus'] == 0)
      return new Error(
        `impossible to determine when employee ${entries[entryIndex]['EmployeeId']} started to work on the project`
      );
    else if (
      entries[entryIndex]['EmployeeId'] == entries[entryIndex + 1]['EmployeeId']
    ) {
      totalTime +=
        jsDateFromSql(entries[entryIndex + 1]['LogTime']) -
        jsDateFromSql(entries[entryIndex]['LogTime']);
      entryIndex += 2;
    } else if (entries[entryIndex]['LogStatus'] == 1) {
      totalTime += currentTime - jsDateFromSql(entries[entryIndex]['LogTime']);
      entryIndex += 1;
    }
  }
  return ` approximately ${(totalTime / 1000 / 60 / 60).toFixed(
    1
  )} hours tracked on the project`;
};

maxEmployeesAtProject = (data) => {
  let maxEmployees = 0,
    currentEmployees = 0,
    dataIndex = 0;
  while (dataIndex < data.length) {
    if (data[dataIndex]['LogStatus'] == 1) {
      currentEmployees += 1;
      if (currentEmployees > maxEmployees) {
        maxEmployees = currentEmployees;
        timeStart = data[dataIndex]['LogTime'];
        timeStop = false;
      }
    } else {
      currentEmployees -= 1;
      if (timeStop === false) {
        timeStop = data[dataIndex]['LogTime'];
      }
    }
    dataIndex += 1;
  }
  return `there were ${maxEmployees} between ${timeStart} and ${timeStop}`;
};

module.exports = {
  formatFileData,
  jsDateToSql,
  jsDateFromSql,
  projectTimeInHours,
  maxEmployeesAtProject,
};
