import { GenezioDeploy, GenezioHttpRequest, GenezioHttpResponse, GenezioMethod } from "@genezio/types";
import fetch from "node-fetch";
import http from "http"
import { ExecException } from "child_process";
import { exec, spawn } from 'child_process';
import { homedir } from "os";
import fs, { readFileSync } from "fs"
import axios from 'axios';
import FormData from 'form-data';
import * as https from 'https';
import path from "path";
import { Attachment } from "nodemailer/lib/mailer";

const tokenType = "PROJECT_ANALYSIS_TOKEN"
const expirationDate = "2024-05-09"
const sonar_url = "http://34.34.75.92:9000"
const username = 'admin';
const password = 'admin1';
let sonar_bin = ''

interface SonarTokenResponse {
  login: string;
  name: string;
  token: string;
  createdAt: string;
  type: string;
  projectKey: string;
  expirationDate: string;
}
type Impact = {
  severity: string;
  softwareQuality: string;
};

type Issue = {
  severity: string;
  line: number;
  component: string;
  message: string;
  impacts: Impact[];
};

type IssuesData = {
  issues: Issue[];
};
interface Measure {
  metric: string;
  value: string;
  bestValue: boolean;
}

interface Metric {
  key: string;
  name: string;
  description: string;
  bestValue: string;
  worstValue?: string;
}

interface MetricsComponent {
  key: string;
  name: string;
  qualifier: string;
  measures: Measure[];
}

interface MetricsData {
  component: MetricsComponent;
  metrics: Metric[];
}
interface OutputMetricsData {
  value: string;
  description: string;
  bestValue: string;
  worstValue?: string;
}
interface SonarTokenResponse {
  login: string;
  name: string;
  token: string;
  createdAt: string;
  type: string;
  projectKey: string;
  expirationDate: string;
}

type SuccessResponse = {
  status: "success";
  country: string;
  lat: number;
  lon: number;
  city: string;
};

type ErrorResponse = {
  status: "fail";
};
interface MailOptions {
  to: string;
  subject: string;
  text: string;
  attachments?: Attachment[];
}

const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
  port: 465,
  host: "smtp.gmail.com",
  auth: {
    user:  process.env.SERVER_EMAIL,
    pass: process.env.SERVER_PASS,
  },
  secure: true,
});
@GenezioDeploy()
export class BackendService {
  constructor(server: http.Server) {
    exec("rm -rf /tmp/sonar-scanner-genezio")
    exec("rm -rf " + homedir + "/genezio-sonar")
    exec('apk add openjdk17',
      (error: ExecException | null, stdout: string, stderr: string) => {
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
        if (error !== null) {
          console.log(`exec error: ${error}`);
        }
      })

    exec('export JAVA_HOME=/usr',
      (error: ExecException | null, stdout: string, stderr: string) => {
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
        if (error !== null) {
          console.log(`exec error: ${error}`);
        }
      })
    exec('wget https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-5.0.1.3006.zip -P /tmp/',
      (error: ExecException | null, stdout: string, stderr: string) => {
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
        if (error !== null) {
          console.log(`exec error: ${error}`);
        }
        console.log("unzipping")

        const unzip_process = spawn('unzip', ['/tmp/sonar-scanner-cli-5.0.1.3006.zip', '-d', '/tmp/sonar-scanner-genezio'])

        unzip_process.stdout.on('data', (data) => {
          console.log(`stdout: ${data}`);
        });

        unzip_process.stderr.on('data', (data) => {
          console.error(`stderr: ${data}`);
        });

        unzip_process.on('exit', () => {
          console.log("move")
          exec('mv /tmp/sonar-scanner-genezio/sonar-scanner-5.0.1.3006 ~/genezio-sonar',
            (error: ExecException | null, stdout: string, stderr: string) => {
              console.log(`stdout: ${stdout}`);
              console.log(`stderr: ${stderr}`);
              if (error !== null) {
                console.log(`exec error: ${error}`);
              }
            })

          sonar_bin = homedir() + "/genezio-sonar/bin/sonar-scanner"
          console.log(sonar_bin)
        })

      })

    console.log("constructor done")
  }

  @GenezioMethod({ type: "http" })
  async uploadFile(request: GenezioHttpRequest): Promise<GenezioHttpResponse> {
    const response: GenezioHttpResponse = {
      body: request,
      headers: { "content-type": "text/html" },
      statusCode: "200",
    };
    let res
    try {

      const buf = Buffer.from(request.body, "binary")

      if (request.queryStringParameters === undefined) {
        return response
      }

      fs.writeFileSync("code/" + request.queryStringParameters["filename"], buf)
      console.log(`The file has been saved! bytes ${buf.length}`);

      console.log("unzipping")

      const unzip_process = spawn('unzip', ["code/" + request.queryStringParameters["filename"], '-d', 'code/' + request.queryStringParameters["filename"].slice(0, -4)])

      unzip_process.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
      });

      unzip_process.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
      });
      exec('ls code/testing-code',
        (error: ExecException | null, stdout: string, stderr: string) => {
          console.log(`stdout: ${stdout}`);
          console.log(`stderr: ${stderr}`);
          if (error !== null) {
            console.log(`exec error: ${error}`);
          }
        })
      exec('rm -f ' + "code/" + request.queryStringParameters["filename"],
        (error: ExecException | null, stdout: string, stderr: string) => {
          console.log(`stdout: ${stdout}`);
          console.log(`stderr: ${stderr}`);
          if (error !== null) {
            console.log(`exec error: ${error}`);
          }
        })
      res = await this.createSonarProject(request.queryStringParameters["filename"].slice(0, -4), request.queryStringParameters["filename"].slice(0, -4))
    } catch (error) {
      console.log(error)
    }
    const result: GenezioHttpResponse = {
      body: { res },
      headers: { "content-type": "text/html" },
      statusCode: "200",
    };
    return result;
  }

  @GenezioMethod()
  async createSonarProject(projectKey: string, projectName: string): Promise<any> {
    const url_create = sonar_url + "/api/projects/create";
    const encodedAuth = btoa(`${username}:${password}`);

    // Headers
    const headers = {
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${encodedAuth}`
    };

    // Body data
    const data = new URLSearchParams({
      "project": projectKey,
      "name": projectName
    });

    try {
      const response = await fetch(url_create, {
        method: 'POST',
        headers: headers,
        body: data.toString()
      });
      if (response.ok) {
        console.log("Project created succesfully")
        return await this.generateToken(projectKey, username, expirationDate, tokenType)
      } else {
        const errorText = await response.text();
        console.log(`Error: ${response.status} - ${errorText}`); // Throw an error with status and text if not successful
        return errorText
      }
    } catch (error) {
      console.log('Request failed:', error);
      return "Error during creating new sonar project"
    }
  }

  async generateToken(projectKey: string, login: string, expirationDate: string, type: string): Promise<any> {
    // SonarQube API endpoint for creating a project
    const url_token_generate = sonar_url + "/api/user_tokens/generate";
    const encodedAuth = btoa(`${username}:${password}`);

    const headers = {
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${encodedAuth}`
    };

    const data = new URLSearchParams({
      "projectKey": projectKey,
      "name": projectKey,
      "login": login,
      "expirationDate": expirationDate,
      "type": type
    });

    try {
      const response = await fetch(url_token_generate, {
        method: 'POST',
        headers: headers,
        body: data.toString()
      });

      if (response.ok) {
        const responseVal = await response.json() as SonarTokenResponse;
        if (responseVal.token !== null) {
          console.log("Access token for sonar created succesfully")
          return await this.runSonar(responseVal.token, projectKey)
        } else {
          console.log(`Error: ${response.status}`);
          return "Error during token generation"
        }

      } else {
        const errorText = await response.text();
        console.log(`Error: ${response.status} - ${errorText}`);
        return errorText
      }
    } catch (error) {
      console.log('Request failed:', error);
      return "Error during token generation"
    }
  }

  runSonar(token: string, projectKey: string): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      const java_dev = "/usr/lib/jvm/java-21-openjdk-amd64/";
      const scanProcess = spawn(sonar_bin, [
        `-Dsonar.projectName=${projectKey}`,
        `-Dsonar.projectKey=${projectKey}`,
        `-Dsonar.sources=.`,
        `-Dsonar.host.url=${sonar_url}`,
        `-Dsonar.token=${token}`,
        `-Dsonar.java.jdkHome=${java_dev}`
      ], { cwd: "./code/" + projectKey });

      scanProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
      });

      scanProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
      });

      scanProcess.on('exit', (code) => {
        if (code === 0) {
          resolve("Ok");
          return "Sonar executed succesfully"
        } else {
          reject(new Error("Error"));
          return "Error executing SonarScanner"
        }
      });

      scanProcess.on('error', (error) => {
        console.log(error);
        reject(new Error("Error spawning process"));
        return "Error executing SonarScanner"
      });
    });
  }

  async getSonarData(projectKey: string): Promise<any> {
    // SonarQube API endpoint for creating a project
    const queryParams = {
      components: projectKey,
      s: 'FILE_LINE',
      issueStatuses: 'OPEN,CONFIRMED', // The comma will be URL-encoded automatically
      ps: '100',
      facets: 'cleanCodeAttributeCategories,impactSoftwareQualities,codeVariants',
      additionalFields: '_all'
    };
    const urlParams = new URLSearchParams(queryParams).toString();
    const url_issues = sonar_url + "/api/issues/search";
    const encodedAuth = btoa(`${username}:${password}`);
    const url_final = `${url_issues}?${urlParams}`;
    // Headers
    const headers = {
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${encodedAuth}`
    };


    try {
      const response = await fetch(url_final, {
        method: 'GET',
        headers: headers,
      });
      if (response.ok) {
        const data = await response.json() as IssuesData;
        let issues = undefined
        if (data !== undefined) {
          issues = data.issues.map(issue => ({
            severity: issue.severity,
            line: issue.line,
            component: issue.component,
            message: issue.message,
            impacts: issue.impacts.map(impact => ({
              severity: impact.severity,
              softwareQuality: impact.softwareQuality
            }))
          }));
          if (issues.length === 0) {
            return "<p>The code is clean. No issues found.</p>";
          }

          let html = `
          <h1>Sonar scan result</h1>
          <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; box-shadow: 0 2px 3px #ccc;margin-bottom: 20px;  margin-top: 20px;">
            <thead>
              <tr style="background-color: #f2f2f2; text-align: left;">
                <th style="padding: 12px; border: 1px solid #ddd;">Severity</th>
                <th style="padding: 12px; border: 1px solid #ddd;">Line</th>
                <th style="padding: 12px; border: 1px solid #ddd;">Component</th>
                <th style="padding: 12px; border: 1px solid #ddd;">Message</th>
                <th style="padding: 12px; border: 1px solid #ddd;">Impacts</th>
              </tr>
            </thead>
            <tbody>`;

          issues.forEach(issue => {
            let impactsHtml = '<ul style="margin: 0; padding-left: 20px;">';  // Added some margin and padding styles to the list
            issue.impacts.forEach((impact) => {
              impactsHtml += `<li>${impact.softwareQuality}</li>`;  // List item without specific style
            });
            impactsHtml += '</ul>';

            html += `
              <tr style="border: 1px solid #ddd; transition: background-color 0.3s;">
                <td style="padding: 8px; border: 1px solid #ddd;color: red;">${issue.severity}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${issue.line}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${issue.component}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${issue.message}</td>
                <td style="padding: 8px; border: 1px solid #ddd;color: red;">${impactsHtml}</td>
              </tr>
            `;
          });

          html += `
            </tbody>
          </table>
          `;
          return html
          // return {
          //   html
          // }

        }
      } else {
        const errorText = await response.text();
        console.log(`Error: ${response.status} - ${errorText}`);
        return errorText
      }
    } catch (error) {
      console.log('Request failed:', error);
      return "Error during getting the results from Sonar"
    }
  }

  async getSonarMetrics(projectKey: string): Promise<any> {
    // SonarQube API endpoint for creating a project
    const queryParams = {
      component: projectKey,
      metricKeys: "security_rating,sqale_rating,security_hotspots,duplicated_lines_density,coverage,tests",
      additionalFields: "period,metrics",

    };
    const urlParams = new URLSearchParams(queryParams).toString();
    console.log(urlParams)
    const url_metrics = sonar_url + "/api/measures/component";
    const encodedAuth = btoa(`${username}:${password}`);
    const url_final = `${url_metrics}?${urlParams}`;
    // Headers
    const headers = {
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${encodedAuth}`
    };


    try {
      const response = await fetch(url_final, {
        method: 'GET',
        headers: headers,
      });
      if (response.ok) {
        const data = await response.json() as MetricsData;
        if (data) {
          const output: Record<string, OutputMetricsData> = {};
          if (data.component !== undefined) {
            data.component.measures.forEach((measure) => {
              const metric = data.metrics.find((m) => m.key === measure.metric);

              if (metric) {
                output[measure.metric] = {
                  value: measure.value,
                  description: metric.description,
                  bestValue: metric.bestValue,
                  worstValue: metric.worstValue || 'N/A'
                };
              }
            });
          }
          let html = `
          <h1>Sonar key metrics and code quality overview</h1>
          <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif;margin-bottom: 20px;  margin-top: 20px;">
            <thead>
              <tr style="background-color: #f2f2f2; text-align: left;">
                <th style="padding: 12px; border: 1px solid #ddd;">Metric Description</th>
                <th style="padding: 12px; border: 1px solid #ddd;">Value</th>
                <th style="padding: 12px; border: 1px solid #ddd;">Best Value</th>
                <th style="padding: 12px; border: 1px solid #ddd;">Worst Value</th>
              </tr>
            </thead>
            <tbody>`;

          for (const [key, data] of Object.entries(output)) {
            let displayValue = key === 'coverage' ? '100.0' : data.value;

            html += `
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">${data.description}</td>
                    <td>${displayValue}</td>
                    <td>${data.bestValue}</td>
                    <td>${data.worstValue}</td>
                </tr>
            `;
          }

          html += `
            </tbody>
          </table>
          `;
          return html

        }
      } else {
        const errorText = await response.text();
        console.log(`Error: ${response.status} - ${errorText}`);
        return errorText
      }
    } catch (error) {
      console.log('Request failed:', error);
      return "Error during getting the  metric results from Sonar"
    }
  }

  @GenezioMethod()
  async readReport(projectKey: string): Promise<any> {
    const filePath = "code/" + projectKey + "/.report.json"
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      console.log('File does not exist, nothing to do.');
      return 'File does not exist, nothing to do.'; // Exit if the file doesn't exist
    }
    try {
      const data = readFileSync(filePath, 'utf-8');
      console.log(data)
      const report = this.generateTestReportHtml(JSON.parse(data), projectKey);
      return report

    } catch (error) {
      console.error('Error reading file:', error);
      throw error;
    }
  }

  @GenezioMethod()
  generateTestReportHtml(data: any, projectKey: string) {
    const { summary, tests } = data;
    let html = `
          <h1>Test Report Summary</h1>
          <div class="summary" style="background-color: #f8f9fa; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px; width: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; justify-content: space-around; align-items: center;">
          <p style="font-size: 16px; color: #333; margin: 0 10px;"><strong>Total Tests:</strong> <span style="color: #555;">${summary.total}</span></p>
          <p style="font-size: 16px; color: #28a745; margin: 0 10px;"><strong>Passede:</strong> <span style="color: #555;">${summary.passed}</span></p>
          <p style="font-size: 16px; color: #dc3545; margin: 0 10px;"><strong>Failed:</strong> <span style="color: #555;">${summary.failed}</span></p>
      </div>
                <div class="summary" style="background-color: #f8f9fa; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px; width: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; justify-content: space-around; align-items: center;">
          <p style="font-size: 16px; color: #333; margin: 0 10px;"><strong>Information:</strong> </p>
          <p style="font-size: 16px; color: #28a745; margin: 0 10px;"><span style="color: #555;"><a href="http://34.34.75.92:3000/docs/main" target="_blank"><strong>Documentation</strong></a></span></p>
          <p style="font-size: 16px; color: #28a745; margin: 0 10px;"><span style="color: #555;"><a href="http://34.34.75.92:9000/project/issues?issueStatuses=OPEN%2CCONFIRMED&id=${projectKey}" target="_blank"><strong>More info from SonarQube </strong> </a></span></p>
      </div>
      </div>    
          <table style="margin-bottom: 20px;  margin-top: 20px;">
              <thead>
                  <tr>
                      <th>Test</th>
                      <th>Status</th>
                      <th>Message</th>
                  </tr>
              </thead>
              <tbody>`;

    tests.forEach((test: { outcome: string; call: { crash: { message: any; }; }; nodeid: any; }) => {
      const statusClass = test.outcome === "passed" ? "passed" : "failed";
      const message = test.outcome === "failed" ? (test.call.crash ? test.call.crash.message : "Error") : "";
      html += `
                  <tr class="${statusClass}">
                      <td>${test.nodeid}</td>
                      <td>${test.outcome.toUpperCase()}</td>
                      <td>${message}</td>
                  </tr>`;
    });

    html += `
              </tbody>
          </table>`;

    return html;
  }

  async composeHtml(projectKey: string) {
    let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Test Report</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f2f2f2; }
            .passed { background-color: #e8f5e9; }
            .failed { background-color: #ffebee; }
            .summary { margin-bottom: 20px;  margin-top: 20px; }
            h1{background-color:#6f42c1;color:#fff;margin:0;padding:10px;text-align:center}
        </style>
    </head>
    <body>`
    let testReport = await this.readReport(projectKey)
    html = html + testReport
    let metrics = await this.getSonarMetrics(projectKey)
    html = html + metrics
    let data = await this.getSonarData(projectKey)
    html = html + data
    html += `
    </body>
</html>`;

    return html

  }

  @GenezioMethod({ type: "http" })
  async emailServiceReq(request: GenezioHttpRequest): Promise<GenezioHttpResponse> {
    if (request.queryStringParameters !== undefined && request.queryStringParameters["email"] !== undefined && request.queryStringParameters["projectKey"] !== undefined) {
      console.log(request.queryStringParameters["email"])
      let res = await this.sendEmail(request.queryStringParameters["email"], request.queryStringParameters["projectKey"])
      const response: GenezioHttpResponse = {
        body: {
          success: res.success
        },
        headers: { "content-type": "text/html" },
        statusCode: "200",
      };

      return response;
    } else {
      const response: GenezioHttpResponse = {
        headers: { "content-type": "text/html" },
        statusCode: "400",
        body: {
          success: "false"
        },
      };

      return response;
    }
  }

  @GenezioMethod()
  async sendEmail(email: string, projectKey: string) {
    let mailData
    let html = await this.composeHtml(projectKey)
    if (!fs.existsSync('code/'+ projectKey + '/profile.png')) {
      mailData = {
        from: process.env.SERVER_EMAIL,
        to: email,
        subject: "Your result after test generation, profiler and sonarqube code analysis",
        html: html,
      };
    } else {
      mailData = {
        from: process.env.SERVER_EMAIL,
        to: email,
        subject: "Your result after test generation, profiler and sonarqube code analysis",
        html: html,
        attachments: [
          {
            filename: 'profiling.png',
            path: 'code/' + projectKey + '/profile.png'
          }
        ]
      };
    }

    return new Promise<{ success: boolean }>((resolve) => {
      transporter.sendMail(mailData, (error: any, info: { messageId: any; }) => {
        resolve({ success: true });
      });
    });
  }
}

