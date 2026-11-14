# Build context is the repo root: backend depends on the engine module.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
COPY engine/pom.xml engine/
COPY backend/pom.xml backend/
RUN mvn -q -B dependency:go-offline -pl backend -am || true
COPY engine/src engine/src
COPY backend/src backend/src
RUN mvn -q -B package -pl backend -am -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/backend/target/backend-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
