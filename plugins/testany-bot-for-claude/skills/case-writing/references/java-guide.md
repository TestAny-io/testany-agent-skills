# Maven / Gradle (Java) 测试脚本指南

Java 测试使用 JUnit 5 框架，支持 Maven 和 Gradle 两种构建工具。

## 适用场景

- Java 项目测试
- 企业级应用测试
- 需要 Java 生态系统的测试
- 与 Java 后端代码共享工具类

## Maven

### ZIP 结构

```
my-test.zip
├── pom.xml
└── src/test/java/com/example/
    └── ApiTest.java
```

### Trigger 配置

```json
{
  "executor": "maven",
  "trigger_path": "./"
}
```

### pom.xml 模板

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>api-tests</artifactId>
    <version>1.0.0</version>

    <properties>
        <maven.compiler.source>11</maven.compiler.source>
        <maven.compiler.target>11</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>5.9.0</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>com.google.code.gson</groupId>
            <artifactId>gson</artifactId>
            <version>2.10</version>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.0.0</version>
            </plugin>
        </plugins>
    </build>
</project>
```

---

## Gradle

### ZIP 结构

```
my-test.zip
├── build.gradle
├── settings.gradle
└── src/test/java/com/example/
    └── ApiTest.java
```

### Trigger 配置

```json
{
  "executor": "gradle",
  "trigger_path": "./"
}
```

### settings.gradle

```groovy
rootProject.name = 'api-tests'
```

### build.gradle

```groovy
plugins {
    id 'java-library'
}

java {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation 'org.junit.jupiter:junit-jupiter:5.9.0'
    implementation 'com.google.code.gson:gson:2.10'
}

tasks.named('test') {
    useJUnitPlatform()
}
```

---

## 代码模板

### 基础 API 测试

```java
package com.example;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import static org.junit.jupiter.api.Assertions.*;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;

public class ApiTest {
    private HttpClient client;
    private String baseUrl;

    @BeforeEach
    void setup() {
        client = HttpClient.newHttpClient();
        baseUrl = System.getenv("API_BASE_URL");
    }

    @Test
    void testLoginSuccess() throws Exception {
        String username = System.getenv("USERNAME");
        String password = System.getenv("PASSWORD");

        String body = String.format(
            "{\"username\":\"%s\",\"password\":\"%s\"}",
            username, password
        );

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/api/login"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();

        HttpResponse<String> response = client.send(
            request,
            HttpResponse.BodyHandlers.ofString()
        );

        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("token"));
    }

    @Test
    void testLoginInvalidCredentials() throws Exception {
        String body = "{\"username\":\"invalid\",\"password\":\"wrong\"}";

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/api/login"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();

        HttpResponse<String> response = client.send(
            request,
            HttpResponse.BodyHandlers.ofString()
        );

        assertEquals(401, response.statusCode());
    }
}
```

### 带 Relay 输出的测试

```java
package com.example;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import static org.junit.jupiter.api.Assertions.*;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

public class LoginWithRelayTest {
    private HttpClient client;
    private String baseUrl;

    @BeforeEach
    void setup() {
        client = HttpClient.newHttpClient();
        baseUrl = System.getenv("API_BASE_URL");
    }

    @Test
    void testLoginAndRelayToken() throws Exception {
        // 登录
        String body = String.format(
            "{\"username\":\"%s\",\"password\":\"%s\"}",
            System.getenv("USERNAME"),
            System.getenv("PASSWORD")
        );

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/api/login"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();

        HttpResponse<String> response = client.send(
            request,
            HttpResponse.BodyHandlers.ofString()
        );

        assertEquals(200, response.statusCode());

        // 解析响应
        JsonObject json = JsonParser.parseString(response.body())
            .getAsJsonObject();
        String token = json.get("token").getAsString();

        // Relay 输出
        relayOutput(String.format(
            "{\"ACCESS_TOKEN\":\"%s\"}",
            token
        ));
    }

    private void relayOutput(String json) throws Exception {
        String relayService = System.getenv("TESTANY_OUTPUT_RELAY_SERVICE");
        if (relayService != null) {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(relayService))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();
            client.send(request, HttpResponse.BodyHandlers.ofString());
        }
    }
}
```

## 环境变量使用

```java
// 必需变量
String apiUrl = System.getenv("API_BASE_URL");

// 可选变量（有默认值）
String timeout = System.getenv("TIMEOUT");
int timeoutMs = timeout != null ? Integer.parseInt(timeout) : 30000;
```

## 注意事项

1. **JDK 版本**：Testany 支持 JDK 11
2. **测试发现**：JUnit 5 自动发现带 `@Test` 注解的方法
3. **包结构**：测试类必须在正确的包路径下
4. **依赖管理**：所有依赖必须在 pom.xml 或 build.gradle 中声明
