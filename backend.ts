import { GenezioDeploy, GenezioHttpRequest, GenezioHttpResponse, GenezioMethod } from "@genezio/types";
import fetch from "node-fetch";
import http from "http"
import { ExecException } from "child_process";
import { exec, spawn } from 'child_process';
import { homedir } from "os";
import fs from "fs"
import * as path from 'path';

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
          resolve("Sonar executed succesfully");
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

}
