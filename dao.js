/* This module deals with the server part - interaction with the db 


DATABASE STRUCTURE 

The db now has one table with fields:

- EmployeeId - Id of the employee (as in the task description), type is selected because according to Google most employees in the world do not exceed 3 million, so over 8 million is sufficient for now
- LogTime - time of a login or logout, DATETIME instead of number format selected for readability
- LogStatus - 1 for login, 0 for logout
- ProjectId - title of the project - also selected for readability 
*/

const sqlite3 = require(`sqlite3`).verbose();
const service = require('./service');
const tableTitle = `timeTracking`;

class AppDAO {
  constructor(dbPath) {
    this.path = dbPath;
  }

  /*for test purposes - creates table */
  initializeDb = async () => {
    this.db = new sqlite3.Database(this.path, (err) => {
      if (err) {
        return err.message;
      } else {
        this.db.run(
          `CREATE TABLE IF NOT EXISTS ${tableTitle} ( EmployeeId MEDIUMINT, LogTime TEXT, LogStatus BOOLEAN, ProjectId TINYTEXT ); `,
          (err) => {
            if (err) {
              return err.message;
            } else {
              return 'table is ready';
            }
          }
        );
      }
    });
  };

  /*deals with tasks 2.1 and 2.3
  Returns last record before selected time of the selected employee to determine what should be the new log status (login of logout was before and vice versa) and the project.
  Supposed to be used for automatic log. */
  getLastLog = (employeeId, logTime = false) => {
    let sqlEntry =
      logTime === false
        ? `SELECT * FROM ${tableTitle} WHERE EmployeeId = ${employeeId}  ORDER BY LogTime DESC LIMIT 1`
        : `SELECT * FROM ${tableTitle} WHERE EmployeeId = ${employeeId} AND LogTime < "${logTime}"  ORDER BY LogTime DESC LIMIT 1`;
    return new Promise((resolve, reject) => {
      this.db.get(sqlEntry, (err, row) => {
        if (err) {
          reject(err);
        } else {
          if (row === undefined) {
            reject(
              new Error(
                `no entries available for employee ${employeeId}, impossible to determine project`
              )
            );
          } else {
            resolve(row);
          }
        }
      });
    });
  };

  /* not requested in task
  for test
  Returns all records for selected user. */
  checkAll = (employeeId) => {
    let sqlEntry = `SELECT * FROM ${tableTitle} WHERE EmployeeId = ${employeeId} ORDER BY LogTime DESC `;
    return new Promise((resolve, reject) => {
      this.db.all(sqlEntry, (err, employeeData) => {
        if (err) {
          reject(err);
        } else {
          employeeData.length > 0
            ? resolve(employeeData)
            : resolve(`no data for employee ${employeeId}`);
        }
      });
    });
  };

  /* deals with tasks 2.1 and 2.3
  writes one entry to db */
  logData = (logInfo) => {
    if (typeof logInfo[1].getMonth === 'function')
      logInfo[1] = service.jsDateToSql(logInfo[1]);
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO ${tableTitle} (EmployeeId, LogTime, LogStatus, ProjectId) VALUES (?, ?, ?, ?)`,
        logInfo,
        (err) => {
          if (err) {
            reject(err);
          } else {
            let successMessage =
              (logInfo[2] == 1 ? `login success ` : `logout success `) +
              `for employee ${logInfo[0]} and project ${logInfo[3]}`;
            resolve(successMessage);
          }
        }
      );
    });
  };

  /* deals with tasks 2.1 and 2.3
  log with auto determining "in" or "out" and project
  Is supposed to be used for automatic log - first get info about previous status and project of the user from the db and then make new record with this user, current time, same project and logout status if vrevious was login and vice versa. */
  getInfoAndLog = async (empId, currentTime) => {
    currentTime = service.jsDateToSql(currentTime);
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.getLastLog(empId, currentTime).then(
          (lastRow) => {
            this.logData([
              empId,
              currentTime,
              lastRow['LogStatus'] == 0 ? 1 : 0,
              lastRow['ProjectId'],
            ]).then(
              (logResult) => {
                resolve(logResult);
              },
              (err) => {
                reject(err);
              }
            );
          },
          (err) => {
            reject(err);
          }
        );
      });
    });
  };

  /* deals with task 2.2
  Accepts data from preprocessed csv file. It is not expected that single employee can generate too large log file. Only minimalistic validity check*/
  loadCSVFile = async (data) => {
    let currentLog = false,
      currentProject = false;

    //remove headers row from file
    if (data[0].includes(`time`)) data.shift();

    data = data.map((x) => x.replace(/, /g, ',').split(`,`));

    //check if log status and project are available in file itself
    if (data[0].length > 2) {
      currentLog = data[0][2];
      if (data[0].length > 3) currentProject = data[0][3];
    }

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        if (currentProject === false) {
          this.getLastLog(data[0][0], data[0][1]).then(
            (lastRow) => {
              (currentLog = lastRow['LogStatus'] == 1 ? 0 : 1),
                (currentProject = lastRow['ProjectId']);
            },
            (err) => {
              reject(err);
            }
          );
        }
        data = service.formatFileData(data, currentLog, currentProject);

        if (data instanceof Error) reject(data);

        let bulkRecord = this.db.prepare(
          ` INSERT INTO ${tableTitle} (EmployeeId, LogTime, LogStatus, ProjectId) VALUES (?, ?, ?, ?)`,
          (err) => {
            if (err) reject(err);
          }
        );
        data.forEach((element) => {
          bulkRecord.run(element, (err) => {
            if (err) reject(err);
          });
        });
        bulkRecord.finalize((err) => {
          if (err) reject(err);
          else resolve(`record success`);
        });
      });
    });
  };

  /* deals with task 2.4 
  Returns time in hours rounded to one decimal pace (8 h 30 min will be represented as 8.5h) spent by all users on a selected project on a given date. By now doesn't handle people working overnight and in different timezones. */
  getProject = (ProjectId) => {
    let sqlEntry = `SELECT * FROM ${tableTitle} WHERE ProjectId = ${ProjectId} ORDER BY EmployeeId, LogTime `;
    return new Promise((resolve, reject) => {
      this.db.all(sqlEntry, (err, projectData) => {
        if (err) {
          reject(err);
        } else {
          if (projectData.length == 0)
            reject(new Error(`no entries for project ${ProjectId} in the db`));
          else {
            const timeInHours = service.projectTimeInHours(projectData);
            if (timeInHours instanceof Error) {
              reject(timeInHours);
            } else resolve(timeInHours);
          }
        }
      });
    });
  };

  /*deals with task 2.5 
  Determines when the highest number of employees were working on a given project at selected day. By now doesn't handle people working overnight and in different timezones. */
  getTime = (date, projectId) => {
    let minTime = new Date(date),
      maxTime = new Date(date);
    maxTime = maxTime.setDate(maxTime.getDate() + 1);
    minTime = service.jsDateToSql(minTime);
    maxTime = service.jsDateToSql(maxTime);
    let sqlEntry = `SELECT * FROM ${tableTitle} WHERE LogTime BETWEEN "${minTime}" AND "${maxTime}" AND ProjectID = ${projectId}  ORDER BY LogTime`;
    return new Promise((resolve, reject) => {
      this.db.all(sqlEntry, (err, row) => {
        if (err) {
          reject(err);
        } else {
          if (row.length == 0)
            reject(
              new Error(
                `no entries for date ${date} and project ${projectId} in the db`
              )
            );
          else {
            resolve(service.maxEmployeesAtProject(row));
          }
        }
      });
    });
  };

  /* Added to keep REST api consistant. */
  deleteDbEntry(employeeId, logTime, logStatus = false, projectId = false) {
    logTime = service.jsDateToSql(logTime);
    let sqlEntry = `DELETE FROM ${tableTitle} WHERE EmployeeId = ${employeeId} AND LogTime = "${logTime}"`;
    if (logStatus !== false) {
      sqlEntry = sqlEntry + `AND LogStatus==${logStatus}`;
    }
    if (projectId !== false) {
      sqlEntry = sqlEntry + `AND ProjectId==${projectId}`;
    }
    sqlEntry = sqlEntry + ';';
    return new Promise((resolve, reject) => {
      this.db.run(sqlEntry, (err) => {
        if (err) {
          reject(err);
        } else {
          let successMessage = `record for employee ${employeeId} at ${logTime}${
            logStatus === 0 ? ' (logout)' : logStatus === 1 ? ' (login)' : ''
          } ${
            projectId !== false ? 'and project ' + projectId : ''
          } didn't exist or is deleted`;
          resolve(successMessage);
        }
      });
    });
  }
}

module.exports = AppDAO;
