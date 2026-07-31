// buy-stuffs — Jenkins-hosted production deploy
//
// Runtime: production runs on the same machine as Jenkins via `docker compose up -d`.
// Jenkins-in-Docker: mount host Docker socket; set BUY_STUFFS_HEALTH_HOST=host.docker.internal
//
// Required:
//   - docker + docker compose v2
//   - Secret file credential `buy-stuffs-dotenv` OR env BUY_STUFFS_ENV_FILE
//
// Optional Telegram: global env TELEGRAM_BOT_TOKEN_CREDENTIALS_ID + TELEGRAM_CHAT_ID_CREDENTIALS_ID
// (values are Jenkins credential ids for Secret text). Also: BUY_STUFFS_HEALTH_HOST, SLACK_WEBHOOK_URL

pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 45, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    parameters {
        booleanParam(
            name: 'SKIP_DEPLOY',
            defaultValue: false,
            description: 'Build images only; do not run docker compose up'
        )
    }

    environment {
        COMPOSE_PROJECT_NAME = 'buy-stuffs'
        DOCKER_BUILDKIT = '1'
        COMPOSE_FILE = 'docker-compose.yml'
        BUY_STUFFS_API_PORT = '7001'
        BUY_STUFFS_WEB_PORT = '7000'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Notify build start') {
            steps {
                script {
                    notifyTelegram('🚀', 'build started', true)
                }
            }
        }

        stage('Prepare environment') {
            steps {
                script {
                    if (env.BUY_STUFFS_ENV_FILE?.trim()) {
                        sh '''
                            set -euo pipefail
                            test -f "$BUY_STUFFS_ENV_FILE"
                            cp "$BUY_STUFFS_ENV_FILE" .env
                        '''
                    } else {
                        withCredentials([
                            file(credentialsId: 'buy-stuffs-dotenv', variable: 'DOTENV_FILE'),
                        ]) {
                            sh '''
                                set -euo pipefail
                                cp "$DOTENV_FILE" .env
                                chmod 600 .env
                            '''
                        }
                    }
                }
                sh '''
                    set -euo pipefail
                    test -f .env
                    tmp="$(mktemp)"
                    tr -d '\015' < .env > "$tmp" && mv "$tmp" .env
                    mkdir -p data/trips
                    echo "Using .env ($(wc -l < .env) lines)"
                '''
            }
        }

        stage('Prepare build markers') {
            steps {
                sh 'rm -f .jenkins_build_api_failed .jenkins_build_web_failed || true'
            }
        }

        stage('Build images') {
            parallel {
                stage('Build api') {
                    steps {
                        sh '''
                            set -uo pipefail
                            export DOCKER_BUILDKIT=1
                            set +e
                            docker compose build api
                            rc=$?
                            set -e
                            if [ "$rc" -ne 0 ]; then
                                touch .jenkins_build_api_failed
                                echo "API image build failed (exit $rc)" >&2
                            fi
                            exit 0
                        '''
                    }
                }
                stage('Build web') {
                    steps {
                        sh '''
                            set -uo pipefail
                            export DOCKER_BUILDKIT=1
                            set +e
                            docker compose build web
                            rc=$?
                            set -e
                            if [ "$rc" -ne 0 ]; then
                                touch .jenkins_build_web_failed
                                echo "Web image build failed (exit $rc)" >&2
                            fi
                            exit 0
                        '''
                    }
                }
            }
        }

        stage('Verify builds') {
            steps {
                sh '''
                    set -euo pipefail
                    failed=""
                    if [ -f .jenkins_build_api_failed ]; then failed="${failed} api"; fi
                    if [ -f .jenkins_build_web_failed ]; then failed="${failed} web"; fi
                    if [ -n "$failed" ]; then
                        echo "One or more image builds failed:${failed}" >&2
                        exit 1
                    fi
                    echo "API and web image builds succeeded"
                '''
            }
        }

        stage('Deploy') {
            when {
                expression { !params.SKIP_DEPLOY }
            }
            steps {
                sh '''
                    set -euo pipefail
                    mkdir -p data/trips
                    docker compose up -d
                '''
            }
        }

        stage('Health check') {
            when {
                expression { !params.SKIP_DEPLOY }
            }
            steps {
                sh '''
                    set -euo pipefail
                    API_PORT="${BUY_STUFFS_API_PORT:-7001}"
                    HEALTH_HOST="${BUY_STUFFS_HEALTH_HOST:-127.0.0.1}"
                    echo "Waiting for http://${HEALTH_HOST}:${API_PORT}/api/health ..."
                    for i in $(seq 1 36); do
                      if curl -sf "http://${HEALTH_HOST}:${API_PORT}/api/health" >/dev/null; then
                        echo "API healthy"
                        exit 0
                      fi
                      sleep 5
                    done
                    echo "Health check timed out after 3 minutes" >&2
                    docker compose ps
                    docker compose logs --tail=80 api
                    exit 1
                '''
            }
        }
    }

    post {
        success {
            script {
                notifySlack('good', "buy-stuffs deploy succeeded — ${env.JOB_NAME} #${env.BUILD_NUMBER}")
                notifyTelegram('✅', 'deploy succeeded')
            }
            echo 'Deploy succeeded.'
        }
        failure {
            script {
                notifySlack('danger', "buy-stuffs deploy FAILED — ${env.JOB_NAME} #${env.BUILD_NUMBER}")
                notifyTelegram('❌', 'deploy FAILED', false, "See ${env.BUILD_URL}console")
            }
            echo 'Deploy failed — see stage logs and `docker compose logs`.'
        }
        always {
            sh '''
                docker image prune -f --filter "until=168h" || true
            '''
        }
    }
}

def notifySlack(String color, String message) {
    def webhook = env.SLACK_WEBHOOK_URL?.trim()
    if (!webhook) {
        return
    }
    def payload = groovy.json.JsonOutput.toJson([
        attachments: [[
            color : color,
            text  : message,
            title : 'buy-stuffs Jenkins',
            footer: "${env.BUILD_URL}",
        ]],
    ])
    writeFile file: 'slack-payload.json', text: payload
    withEnv(["SLACK_WEBHOOK_URL=${webhook}"]) {
        sh '''
            set -euo pipefail
            curl -sf -X POST -H 'Content-type: application/json' -d @slack-payload.json "$SLACK_WEBHOOK_URL"
        '''
    }
}

def notifyTelegram(String statusEmoji, String statusLabel, boolean inProgress = false, String errorDetail = null) {
    def tokenCredId = env.TELEGRAM_BOT_TOKEN_CREDENTIALS_ID?.trim()
    def chatCredId = env.TELEGRAM_CHAT_ID_CREDENTIALS_ID?.trim()
    if (!tokenCredId || !chatCredId) {
        echo 'Telegram notify skipped — set global env TELEGRAM_BOT_TOKEN_CREDENTIALS_ID and TELEGRAM_CHAT_ID_CREDENTIALS_ID'
        return
    }

    withCredentials([
        string(credentialsId: tokenCredId, variable: 'TELEGRAM_BOT_TOKEN'),
        string(credentialsId: chatCredId, variable: 'TELEGRAM_CHAT_ID'),
    ]) {
        def duration = inProgress ? 'in progress' : (currentBuild.durationString ?: 'n/a')
        def branch = env.GIT_BRANCH ?: env.BRANCH_NAME ?: 'unknown'
        def commit = env.GIT_COMMIT ? env.GIT_COMMIT.take(7) : 'n/a'
        def skipDeploy = params.SKIP_DEPLOY ? 'yes' : 'no'
        def text = """${statusEmoji} buy-stuffs ${statusLabel}

Job: ${env.JOB_NAME} #${env.BUILD_NUMBER}
Branch: ${branch}
Commit: ${commit}
Duration: ${duration}
SKIP_DEPLOY: ${skipDeploy}
${env.BUILD_URL}"""
        if (errorDetail?.trim()) {
            def snippet = errorDetail.trim()
            if (snippet.length() > 1800) {
                snippet = snippet.take(1797) + '...'
            }
            text += "\n\n--- error ---\n${snippet}"
        }
        def payload = groovy.json.JsonOutput.toJson([
            chat_id: env.TELEGRAM_CHAT_ID,
            text: text,
            disable_web_page_preview: true,
        ])
        writeFile file: 'telegram-payload.json', text: payload
        sh '''
            set +e
            curl -sf -X POST \
              -H 'Content-Type: application/json' \
              -d @telegram-payload.json \
              "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"
            rc=$?
            set -e
            if [ "$rc" -ne 0 ]; then
              echo "Telegram notify failed (build result unchanged)"
            fi
        '''
    }
}
