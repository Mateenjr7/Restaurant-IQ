variable "aws_region" {
  description = "AWS region for the EKS cluster and VPC."
  type        = string
  nullable    = false
}

variable "cluster_admin_cidrs" {
  description = "Public IPv4 CIDRs allowed to reach the EKS Kubernetes API. Use your current IP with /32."
  type        = list(string)
  nullable    = false

  validation {
    condition = length(var.cluster_admin_cidrs) > 0 && alltrue([
      for cidr in var.cluster_admin_cidrs : cidr != "0.0.0.0/0" && can(cidrnetmask(cidr))
    ])
    error_message = "Provide at least one valid IPv4 CIDR and do not expose the Kubernetes API to 0.0.0.0/0."
  }
}

variable "cluster_name" {
  description = "Name of the EKS cluster and related resources."
  type        = string
  default     = "restaurantiq-capstone"
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version."
  type        = string
  default     = "1.34"
}

variable "node_instance_types" {
  description = "EC2 instance types for the managed node group."
  type        = list(string)
  default     = ["t3.medium"]

  validation {
    condition     = length(var.node_instance_types) > 0
    error_message = "Specify at least one EC2 instance type."
  }
}

variable "node_min_size" {
  description = "Minimum managed worker-node count."
  type        = number
  default     = 1
}

variable "node_desired_size" {
  description = "Initial desired managed worker-node count."
  type        = number
  default     = 1
}

variable "node_max_size" {
  description = "Maximum managed worker-node count."
  type        = number
  default     = 2

  validation {
    condition     = var.node_max_size >= 1 && var.node_max_size <= 4
    error_message = "Keep the capstone node group between 1 and 4 nodes to limit cost."
  }
}
