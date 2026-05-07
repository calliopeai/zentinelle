#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Zentinelle Opscode — Command Center
#
# Usage:
#   ./run.sh init aws dev         # terraform init for AWS dev
#   ./run.sh plan aws dev         # terraform plan
#   ./run.sh apply aws dev        # terraform apply
#   ./run.sh destroy aws dev      # terraform destroy
#   ./run.sh fmt                  # format all .tf files
#   ./run.sh validate             # validate all terraform directories
#   ./run.sh bootstrap aws dev    # first-time backend + init for dev
#   ./run.sh bootstrap aws all    # bootstrap all environments
#
# Configuration:
#   Edit aws/config.env to set PROJECT, AWS_REGION, and OWNER.
# -----------------------------------------------------------------------------

set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# -----------------------------------------------------------------------------
# Load config
# -----------------------------------------------------------------------------

load_config() {
  local cloud="${1:-aws}"
  local config_file="${SCRIPT_DIR}/${cloud}/config.env"

  if [[ -f "${config_file}" ]]; then
    # shellcheck source=/dev/null
    source "${config_file}"
  else
    warn "Config file not found: ${config_file} — using defaults"
    PROJECT="${PROJECT:-zentinelle}"
    AWS_REGION="${AWS_REGION:-us-west-2}"
    OWNER="${OWNER:-calliopeai}"
  fi
}

# Backend config flags for a given environment
backend_config_flags() {
  local env="${1}"
  echo "-backend-config=bucket=tf-state.${PROJECT}-${env}.net"
  echo "-backend-config=dynamodb_table=${PROJECT}-${env}-tfstate-lock"
  echo "-backend-config=key=terraform.tfstate"
  echo "-backend-config=region=${AWS_REGION}"
  echo "-backend-config=encrypt=true"
}

usage() {
  echo "Usage: ./run.sh <command> [cloud] [environment]"
  echo ""
  echo "Commands:"
  echo "  init <cloud> <env>           terraform init (configures backend)"
  echo "  plan <cloud> <env>           terraform plan"
  echo "  apply <cloud> <env>          terraform apply"
  echo "  destroy <cloud> <env>        terraform destroy"
  echo "  fmt                          format all .tf files"
  echo "  validate                     validate all terraform directories"
  echo "  bootstrap <cloud> <env|all>  create state backend + init"
  echo ""
  echo "Cloud:       aws | gcp | azure"
  echo "Environment: dev | stg | prd | all (bootstrap only)"
  echo ""
  echo "Configuration: edit aws/config.env"
  exit 1
}

# Resolve the working directory for a cloud/environment pair
resolve_dir() {
  local cloud="${1}"
  local env="${2}"
  local dir="${SCRIPT_DIR}/${cloud}/environments/${env}"

  [[ -d "${dir}" ]] || error "Directory not found: ${dir}"
  echo "${dir}"
}

# -----------------------------------------------------------------------------
# Commands
# -----------------------------------------------------------------------------

cmd_init() {
  local cloud="${1:?Missing cloud argument}"
  local env="${2:?Missing environment argument}"
  local dir
  dir=$(resolve_dir "${cloud}" "${env}")

  load_config "${cloud}"

  info "Initializing ${cloud}/${env}..."
  # shellcheck disable=SC2046
  terraform -chdir="${dir}" init \
    -input=false \
    $(backend_config_flags "${env}")
  success "Init complete: ${cloud}/${env}"
}

cmd_plan() {
  local cloud="${1:?Missing cloud argument}"
  local env="${2:?Missing environment argument}"
  local dir
  dir=$(resolve_dir "${cloud}" "${env}")

  load_config "${cloud}"

  info "Planning ${cloud}/${env}..."
  terraform -chdir="${dir}" plan -input=false -var="region=${AWS_REGION}"
  success "Plan complete: ${cloud}/${env}"
}

cmd_apply() {
  local cloud="${1:?Missing cloud argument}"
  local env="${2:?Missing environment argument}"
  local dir
  dir=$(resolve_dir "${cloud}" "${env}")

  load_config "${cloud}"

  info "Applying ${cloud}/${env}..."
  terraform -chdir="${dir}" apply -input=false -var="region=${AWS_REGION}"
  success "Apply complete: ${cloud}/${env}"
}

cmd_destroy() {
  local cloud="${1:?Missing cloud argument}"
  local env="${2:?Missing environment argument}"
  local dir
  dir=$(resolve_dir "${cloud}" "${env}")

  load_config "${cloud}"

  warn "Destroying ${cloud}/${env}..."
  terraform -chdir="${dir}" destroy -input=false -var="region=${AWS_REGION}"
  success "Destroy complete: ${cloud}/${env}"
}

cmd_fmt() {
  info "Formatting all Terraform files..."
  terraform fmt -recursive "${SCRIPT_DIR}"
  success "Format complete"
}

cmd_validate() {
  local exit_code=0

  info "Validating all Terraform directories..."

  while IFS= read -r dir; do
    local tf_dir
    tf_dir=$(dirname "${dir}")

    [[ "${tf_dir}" == *".terraform"* ]] && continue

    info "Validating ${tf_dir#${SCRIPT_DIR}/}..."

    if [[ ! -d "${tf_dir}/.terraform" ]]; then
      terraform -chdir="${tf_dir}" init -backend=false -input=false >/dev/null 2>&1 || true
    fi

    if terraform -chdir="${tf_dir}" validate >/dev/null 2>&1; then
      success "  Valid"
    else
      echo -e "${RED}  Invalid${NC}"
      terraform -chdir="${tf_dir}" validate
      exit_code=1
    fi
  done < <(find "${SCRIPT_DIR}" -name "*.tf" -not -path "*/.terraform/*" | sort -u)

  if [[ ${exit_code} -eq 0 ]]; then
    success "All directories valid"
  else
    error "Validation failed"
  fi
}

cmd_bootstrap() {
  local cloud="${1:?Missing cloud argument}"
  local env="${2:?Missing environment argument}"

  case "${cloud}" in
    aws)
      local bootstrap_script="${SCRIPT_DIR}/aws/scripts/bootstrap.sh"
      if [[ -f "${bootstrap_script}" ]]; then
        "${bootstrap_script}" "${env}"
      else
        error "Bootstrap script not found: ${bootstrap_script}"
      fi
      ;;
    *)
      error "Bootstrap is currently only supported for AWS"
      ;;
  esac
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

COMMAND="${1:-}"
shift || true

case "${COMMAND}" in
  init)      cmd_init "$@" ;;
  plan)      cmd_plan "$@" ;;
  apply)     cmd_apply "$@" ;;
  destroy)   cmd_destroy "$@" ;;
  fmt)       cmd_fmt ;;
  validate)  cmd_validate ;;
  bootstrap) cmd_bootstrap "$@" ;;
  *)         usage ;;
esac
