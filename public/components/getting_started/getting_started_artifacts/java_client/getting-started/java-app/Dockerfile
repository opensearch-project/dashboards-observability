FROM maven:3.8.4-openjdk-11-slim AS build

WORKDIR /app

COPY pom.xml .
COPY src ./src

RUN mvn clean package

FROM openjdk:11-slim

WORKDIR /app

COPY --from=build /app/target/java-app-1.0-SNAPSHOT.jar app.jar

CMD ["java", "-jar", "app.jar"]
