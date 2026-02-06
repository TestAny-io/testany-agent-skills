# Maven / Gradle 模板

Maven 和 Gradle 执行器用于 Java 项目测试。

## ZIP 结构 (Maven)

```
my-test.zip
├── pom.xml
└── src/test/java/com/example/
    └── ApiTest.java
```

## ZIP 结构 (Gradle)

```
my-test.zip
├── build.gradle
└── src/test/java/com/example/
    └── ApiTest.java
```

## Trigger 配置

**Maven:**
```json
{"executor": "maven", "trigger_path": "./"}
```

**Gradle:**
```json
{"executor": "gradle", "trigger_path": "./"}
```

## pom.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>api-tests</artifactId>
    <version>1.0.0</version>
    <properties>
        <maven.compiler.source>11</maven.compiler.source>
        <maven.compiler.target>11</maven.compiler.target>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>5.9.0</version>
            <scope>test</scope>
        </dependency>
    </dependencies>
</project>
```

## 代码模板

```java
package com.example;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import java.net.http.*;
import java.net.URI;

public class ApiTest {
    private final String baseUrl = System.getenv("API_BASE_URL");

    @Test
    void testLogin() throws Exception {
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

        HttpResponse<String> response = HttpClient.newHttpClient()
            .send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
    }
}
```

## Relay 输出

```java
import java.net.http.*;
import java.net.URI;

public void relayOutput(String key, String value) throws Exception {
    String relayService = System.getenv("TESTANY_OUTPUT_RELAY_SERVICE");
    if (relayService != null) {
        String json = String.format("{\"%s\": \"%s\"}", key, value);
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(relayService))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json))
            .build();
        HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    }
}

// 使用
relayOutput("ACCESS_TOKEN", token);
```

## 官方文档

- [Maven Guidelines](https://docs.testany.io/en/docs/test-case-writing-guidelines-and-examples-maven/)
- [Gradle Guidelines](https://docs.testany.io/en/docs/test-case-writing-guidelines-and-examples-gradle/)
